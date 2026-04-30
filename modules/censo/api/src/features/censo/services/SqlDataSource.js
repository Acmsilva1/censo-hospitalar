import duckdb from 'duckdb';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { config } from '../../../core/config/env.js';
function normalizeRow(row) {
    const out = { ...row };
    for (const [k, v] of Object.entries(out)) {
        if (typeof v === 'bigint') {
            const n = Number(v);
            out[k] = Number.isSafeInteger(n) ? n : v.toString();
        }
    }
    return out;
}
function quoteSqlPath(absPath) {
    return path.resolve(absPath).replace(/\\/g, '/').replace(/'/g, "''");
}
class DuckDbDataSource {
    db;
    conn;
    ready = false;
    constructor() {
        fs.mkdirSync(path.dirname(config.DUCKDB_PATH), { recursive: true });
        this.db = new duckdb.Database(config.DUCKDB_PATH);
        this.conn = this.db.connect();
    }
    sourceName() {
        return `duckdb:${config.DUCKDB_PATH}`;
    }
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.conn.all(sql, ...params, (err, rows) => {
                if (err)
                    return reject(err);
                const out = (rows || []).map((r) => normalizeRow(r));
                resolve(out);
            });
        });
    }
    async initialize() {
        if (this.ready)
            return;
        const dataDir = config.DATASET_PATH;
        const tables = [
            { name: 'raw_leitos', base: 'tbl_intern_leitos' },
            { name: 'raw_ocupacao', base: 'tbl_ocupacao_internacao' },
            { name: 'raw_taxa', base: 'vw_taxa_ocupacao_com_pacientes' },
            { name: 'raw_internacoes', base: 'tbl_intern_internacoes' },
        ];
        for (const table of tables) {
            const pq = path.join(dataDir, `${table.base}.parquet`);
            const csv = path.join(dataDir, `${table.base}.csv`);
            let sourceSql = '';
            if (fs.existsSync(pq))
                sourceSql = `read_parquet('${quoteSqlPath(pq)}')`;
            else if (fs.existsSync(csv))
                sourceSql = `read_csv_auto('${quoteSqlPath(csv)}')`;
            if (!sourceSql)
                continue;
            await this.query(`CREATE OR REPLACE TABLE ${table.name} AS SELECT * FROM ${sourceSql}`);
        }
        await this.query(`
      CREATE OR REPLACE VIEW censo_consolidado AS
      WITH normalized_leitos AS (
        SELECT
          CAST(CD_ESTABELECIMENTO AS VARCHAR) as unitId,
          upper(trim(UNIDADE)) as hospitalName,
          upper(trim(DS_SETOR_ATENDIMENTO)) as sectorRaw,
          regexp_replace(regexp_replace(upper(trim(LEITO)), '^(ENF|APT|APTO|BOX|UTI|ISOL|AP|UPC)\\s*', ''), '[^A-Z0-9]', '', 'g') as id,
          CASE
            WHEN regexp_matches(upper(trim(DS_SETOR_ATENDIMENTO)), 'UTI|UPC|TERAPIA INTENSIVA|PACIENTE CRITICO', 'i') THEN 'UTI'
            WHEN regexp_matches(upper(trim(TIPO)), 'BLACK|BLK', 'i') THEN 'APT BLK'
            WHEN regexp_matches(upper(trim(TIPO)), 'APT|APARTAMENTO', 'i') THEN 'APT'
            WHEN regexp_matches(upper(trim(TIPO)), 'ENF|ENFERMARIA', 'i') THEN 'ENF'
            ELSE upper(trim(TIPO))
          END as rawTipo,
          IE_SITUACAO as ieSituacao
        FROM raw_leitos
        QUALIFY ROW_NUMBER() OVER(PARTITION BY CD_ESTABELECIMENTO, id ORDER BY TIPO DESC) = 1
      ),
      normalized_status AS (
        SELECT
          CAST(CD_ESTABELECIMENTO AS VARCHAR) as unitId,
          regexp_replace(regexp_replace(upper(trim(LEITO)), '^(ENF|APT|APTO|BOX|UTI|ISOL|AP|UPC)\\s*', ''), '[^A-Z0-9]', '', 'g') as id,
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
          CAST(NR_ATENDIMENTO AS VARCHAR) as patientId,
          DT_ALTA_MEDICO as dischargeForecast,
          DT_ENTRADA as admissionDate
        FROM raw_ocupacao
        QUALIFY ROW_NUMBER() OVER(PARTITION BY CD_ESTABELECIMENTO, id ORDER BY (NR_ATENDIMENTO IS NOT NULL) DESC, DT_ENTRADA DESC) = 1
      ),
      pacientes_clinicos AS (
        SELECT
          CAST(NR_ATENDIMENTO AS VARCHAR) as patientId,
          upper(trim(PACIENTE)) as patientName,
          CAST(IDADE AS VARCHAR) as patientAge,
          upper(trim(SEXO)) as patientSex,
          upper(trim(MEDICO_RESPONSAVEL)) as doctorAdmission,
          upper(trim(MEDICO_ALTA)) as doctorDischarge
        FROM raw_internacoes
        QUALIFY ROW_NUMBER() OVER(PARTITION BY NR_ATENDIMENTO ORDER BY DT_ENTRADA DESC) = 1
      )
      SELECT
        l.unitId, l.hospitalName, l.sectorRaw, l.id, l.rawTipo, l.ieSituacao,
        COALESCE(s.status, 'Disponível') as status,
        s.patientId, p.patientName, p.patientAge, p.patientSex, s.admissionDate, s.dischargeForecast, p.doctorAdmission, p.doctorDischarge
      FROM normalized_leitos l
      LEFT JOIN normalized_status s ON l.unitId = s.unitId AND l.id = s.id
      LEFT JOIN pacientes_clinicos p ON s.patientId = p.patientId
    `);
        this.ready = true;
    }
    async refresh() {
        this.ready = false;
        await this.initialize();
    }
}
class PostgresDataSource {
    pool;
    constructor() {
        this.pool = new Pool({ connectionString: config.DATABASE_URL });
    }
    sourceName() {
        return 'postgres';
    }
    async initialize() {
        await this.pool.query('SELECT 1');
    }
    async refresh() {
        return;
    }
    async query(sql, params = []) {
        const res = await this.pool.query(sql, params);
        return (res.rows || []).map((r) => normalizeRow(r));
    }
}
let instance = null;
export function getDataSource() {
    if (!instance) {
        instance = config.DATA_SOURCE === 'postgres' ? new PostgresDataSource() : new DuckDbDataSource();
    }
    return instance;
}
//# sourceMappingURL=SqlDataSource.js.map