import duckdb from 'duckdb';
import path from 'path';
import fs from 'fs';
import { config } from '../../../core/config/env.js';

function quoteSqlPath(absPath: string): string {
  return path.resolve(absPath).replace(/\\/g, '/').replace(/'/g, "''");
}

function normalizeRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'bigint') {
      const n = Number(v);
      out[k] = Number.isSafeInteger(n) ? n : v.toString();
    }
  }
  return out as T;
}

/**
 * DuckDbService — O Motor de Dados da Aplicação
 *
 * DuckDB in-memory: ingere **Parquet** (preferido) ou **CSV** por tabela (somente leitura).
 */
export class DuckDbService {
  private static instance: DuckDbService;
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  private isInitialized: boolean = false;

  private constructor() {
    // Usamos um arquivo local para persistência simples ou :memory: para volátil
    // Mantendo em memória por enquanto para performance máxima de refresh
    this.db = new duckdb.Database(':memory:');
    this.conn = this.db.connect();
  }

  public static getInstance(): DuckDbService {
    if (!DuckDbService.instance) {
      DuckDbService.instance = new DuckDbService();
    }
    return DuckDbService.instance;
  }

  /**
   * Executa uma query SQL e retorna os resultados como Promise
   */
  public query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, ...params, (err: any, res: any) => {
        if (err) {
          console.error(`[DuckDB] Erro na query: ${sql}`, err);
          return reject(err);
        }
        const rows = (res as T[]) || [];
        resolve(rows.map((r) => normalizeRow(r as Record<string, unknown>)) as T[]);
      });
    });
  }

  /**
   * Inicializa o banco: carrega Parquet/CSV da pasta `DATASET_PATH` e cria as views de negócio.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[DuckDB] Inicializando motor de dados...');

      const dataDir = config.DATASET_PATH;

      const tables = [
        { name: 'raw_leitos', base: 'tbl_intern_leitos' },
        { name: 'raw_ocupacao', base: 'tbl_ocupacao_internacao' },
        { name: 'raw_taxa', base: 'vw_taxa_ocupacao_com_pacientes' },
        { name: 'raw_internacoes', base: 'tbl_intern_internacoes' }
      ];

      for (const table of tables) {
        const pqPath = path.join(dataDir, `${table.base}.parquet`);
        const csvPath = path.join(dataDir, `${table.base}.csv`);
        let sourceSql: string | null = null;
        let picked: string | null = null;
        if (fs.existsSync(pqPath)) {
          picked = pqPath;
          sourceSql = `read_parquet('${quoteSqlPath(pqPath)}')`;
        } else if (fs.existsSync(csvPath)) {
          picked = csvPath;
          sourceSql = `read_csv_auto('${quoteSqlPath(csvPath)}')`;
        }
        if (sourceSql && picked) {
          await this.query(`CREATE OR REPLACE TABLE ${table.name} AS SELECT * FROM ${sourceSql}`);
          console.log(`[DuckDB] Tabela ${table.name} ← ${path.basename(picked)}`);
        } else {
          console.warn(`[DuckDB] Sem dados para ${table.name}: falta ${table.base}.parquet ou .csv em ${dataDir}`);
        }
      }

      // 2. Criar Views de Consolidação (O "ETL" pesado)
      await this.setupViews();

      this.isInitialized = true;
      console.log('[DuckDB] Motor de dados pronto.');
    } catch (error) {
      console.error('[DuckDB] Falha crítica na inicialização:', error);
      throw error;
    }
  }

  /**
   * Recarrega os dados (Refresh)
   */
  public async refresh(): Promise<void> {
    this.isInitialized = false;
    await this.initialize();
  }

  private async setupViews(): Promise<void> {
    // View de Normalização de Leitos e Status
    // Aqui traduzimos a lógica do BedStatusService e CsvParser para SQL
    
    await this.query(`
      CREATE OR REPLACE VIEW censo_consolidado AS
      WITH normalized_leitos AS (
        SELECT 
          CAST(CD_ESTABELECIMENTO AS VARCHAR) as unitId,
          upper(trim(UNIDADE)) as hospitalName,
          upper(trim(DS_SETOR_ATENDIMENTO)) as sectorRaw,
          upper(trim(LEITO)) as rawBedName,
          upper(trim(TIPO)) as rawTipo,
          -- Inteligência de Tipo (Igual à antiga lógica TS)
          CASE 
            WHEN regexp_matches(upper(trim(DS_SETOR_ATENDIMENTO)), 'UTI|UPC|TERAPIA INTENSIVA|PACIENTE CRITICO', 'i') THEN 'UTI'
            WHEN regexp_matches(upper(trim(TIPO)), 'BLACK|BLK', 'i') THEN 'APT BLK'
            WHEN regexp_matches(upper(trim(TIPO)), 'APT|APARTAMENTO', 'i') THEN 'APT'
            WHEN regexp_matches(upper(trim(TIPO)), 'ENF|ENFERMARIA', 'i') THEN 'ENF'
            ELSE upper(trim(TIPO))
          END as normalizedTipo,
          -- Normalização do Nome do Leito
          regexp_replace(regexp_replace(upper(trim(LEITO)), '^(ENF|APT|APTO|BOX|UTI|ISOL|AP|UPC)\\s*', ''), '[^A-Z0-9]', '', 'g') as normalizedBed,
          IE_SITUACAO as ieSituacao
        FROM raw_leitos
        -- DEDUPLICAÇÃO DE LEITOS (Garantia de registro único por leito físico)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY CD_ESTABELECIMENTO, normalizedBed ORDER BY TIPO DESC) = 1
      ),
      normalized_status AS (
        SELECT 
          CAST(CD_ESTABELECIMENTO AS VARCHAR) as unitId,
          regexp_replace(regexp_replace(upper(trim(LEITO)), '^(ENF|APT|APTO|BOX|UTI|ISOL|AP|UPC)\\s*', ''), '[^A-Z0-9]', '', 'g') as normalizedBed,
          CASE 
            WHEN upper(trim(STATUS)) IN ('PACIENTE', 'OCUPADO') THEN 'Ocupado'
            WHEN upper(trim(STATUS)) IN ('LIVRE', 'DISPONIVEL', 'DISPONÍVEL') THEN 'Disponível'
            WHEN upper(trim(STATUS)) IN ('EM HIGIENIZAÇÃO', 'AGUARDANDO HIGIENIZAÇÃO', 'HIGIENIZACAO', 'HIGIENIZAÇÃO') THEN 'Higienização'
            WHEN upper(trim(STATUS)) IN ('EM PROCESSOS DE ALTA', 'EM PROCESSO DE ALTA') THEN 'Alta Confirmada'
            WHEN upper(trim(STATUS)) IN ('EM MANUTENÇÃO', 'MANUTENÇÃO', 'MANUTENCAO') THEN 'Manutenção'
            WHEN upper(trim(STATUS)) IN ('INTERDITADO') THEN 'Interditado'
            WHEN upper(trim(STATUS)) IN ('RESERVADO') THEN 'Reservado'
            ELSE STATUS
          END as status,
          CAST(NR_ATENDIMENTO AS VARCHAR) as attendanceId,
          DT_ALTA_MEDICO,
          DT_ENTRADA
        FROM raw_ocupacao
        -- DEDUPLICAÇÃO DE STATUS (Garantia de 1 estado por leito, priorizando registros com paciente)
        QUALIFY ROW_NUMBER() OVER(PARTITION BY CD_ESTABELECIMENTO, normalizedBed ORDER BY (NR_ATENDIMENTO IS NOT NULL) DESC, DT_ENTRADA DESC) = 1
      ),
      pacientes_clinicos AS (
        SELECT 
          CAST(NR_ATENDIMENTO AS VARCHAR) as attendanceId,
          upper(trim(PACIENTE)) as patientName,
          CAST(IDADE AS VARCHAR) as patientAge,
          upper(trim(SEXO)) as patientSex,
          DT_ENTRADA as admissionDate,
          DT_ALTA_MEDICO as dischargeForecast,
          upper(trim(MEDICO_RESPONSAVEL)) as doctorAdmission,
          upper(trim(MEDICO_ALTA)) as doctorDischarge
        FROM raw_internacoes
        QUALIFY ROW_NUMBER() OVER(PARTITION BY NR_ATENDIMENTO ORDER BY DT_ENTRADA DESC) = 1
      )
      SELECT 
        l.unitId,
        l.hospitalName,
        l.normalizedBed as id,
        l.normalizedTipo as rawTipo, -- Injetamos o tipo normalizado para o frontend
        l.sectorRaw,
        COALESCE(s.status, 'Disponível') as status,
        s.attendanceId as patientId,
        p.patientName,
        p.patientAge,
        p.patientSex,
        p.admissionDate,
        p.dischargeForecast,
        p.doctorAdmission,
        p.doctorDischarge,
        l.ieSituacao
      FROM normalized_leitos l
      LEFT JOIN normalized_status s ON l.unitId = s.unitId AND l.normalizedBed = s.normalizedBed
      LEFT JOIN pacientes_clinicos p ON s.attendanceId = p.attendanceId
    `);

    console.log('[DuckDB] Views de consolidação criadas.');
  }
}
