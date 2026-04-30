import fs from 'fs';
import csv from 'csv-parser';
import path from 'path';
import { config } from '../../../core/config/env.js';
import type {
  ICensoRepository,
  PatientMap,
  PatientRecord,
  AvailabilityMap,
  AvailabilityRecord,
  ComplementMap,
  ComplementRecord,
} from './ICensoRepository.js';

// Mapa de normalização de status do Tasy para domínio da aplicação
const STATUS_MAP: Record<string, string> = {
  'PACIENTE':                 'Ocupado',
  'LIVRE':                    'Disponível',
  'EM HIGIENIZAÇÃO':          'Higienização',
  'AGUARDANDO HIGIENIZAÇÃO':  'Higienização',
  'EM PROCESSOS DE ALTA':     'Alta Confirmada',
  'EM PROCESSO DE ALTA':      'Alta Confirmada',
  'EM MANUTENÇÃO':            'Manutenção',
  'MANUTENÇÃO':               'Manutenção',
  'INTERDITADO':              'Interditado',
  'RESERVADO':                'Reservado',
};

export class CsvCensoRepository implements ICensoRepository {
  private readonly dataDir: string;
  private readonly masterFilePath: string;
  private readonly availabilityFilePath: string;
  private readonly ocupacaoFilePath: string;
  private readonly complementFilePath: string;

  // Mapa de Aliases para unificação de unidades com múltiplos códigos no Tasy
  private readonly UNIT_ID_REMAP: Record<string, string> = {
    // Removido remap 26->24 pois 26 é o oficial e 24 é apenas clínica
  };

  /** Preferência: `.parquet` na mesma pasta, senão `.csv` (só leitura). */
  private resolveExisting(base: string): string {
    const pq = path.join(this.dataDir, `${base}.parquet`);
    const csv = path.join(this.dataDir, `${base}.csv`);
    if (fs.existsSync(pq)) return pq;
    if (fs.existsSync(csv)) return csv;
    return csv;
  }

  constructor(dataDir?: string) {
    this.dataDir = dataDir ? path.resolve(dataDir) : config.DATASET_PATH;
    this.masterFilePath = this.resolveExisting('tbl_intern_leitos');
    this.availabilityFilePath = this.resolveExisting('tbl_ocupacao_internacao');
    this.ocupacaoFilePath = this.resolveExisting('vw_taxa_ocupacao_com_pacientes');
    this.complementFilePath = this.resolveExisting('tbl_intern_internacoes');
  }

  // ── Utilitários privados e getters ───────────────────────────────────────

  public getMasterFilePath(): string {
    return this.masterFilePath;
  }

  private isCsvFile(absPath: string): boolean {
    return absPath.toLowerCase().endsWith('.csv');
  }

  private normalizeBedName(name: string): string {
    if (!name) return 'N/A';
    let cleaned = name.trim().toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, ' ');

    // Se o nome tem prefixos (ENF, APT, etc) seguido de números, removemos o prefixo
    cleaned = cleaned.replace(/^(ENF|APT|APTO|BOX|UTI|ISOL|AP)\s+/g, '');

    const parts = cleaned.split(' ');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const prev = parts[parts.length - 2];
      
      // Caso "5 5A" ou "05 A" -> unificar para "5A"
      if (/^\d+$/.test(prev) && /^[A-Z0-9]+$/.test(last)) {
        if (last.startsWith(prev) && last.length > prev.length) cleaned = last;
        else if (!last.startsWith(prev)) cleaned = prev + last;
      }
    }

    return cleaned
      .replace(/\b0+(\d+)/g, '$1') // Remove zeros à esquerda: 01 -> 1
      .replace(/[^A-Z0-9]/g, '');  // Remove tudo exceto letras e números
  }

  private normalizeSectorName(name: string): string {
    if (!name) return '';
    const parts = name.split(' - ');
    return (parts.length > 1 ? parts[1] : parts[0])
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '');
  }

  private normalizeTipoName(type: string): string {
    if (!type) return 'GERAL';
    const t = type.trim().toUpperCase();
    
    // 1. Unificação Crítica UTI/UPC
    if (t.includes('UTI') || t.includes('UPC') || t.includes('PACIENTE CRITICO') || t.includes('PACIENTE CRÍTICO')) return 'UTI';
    
    // 2. Precedência Especial: Black vem antes de Apartamento comum
    if (t.includes('BLACK') || t.includes('BLK')) return 'APT BLK';
    
    // 3. Regras Genéricas (com suporte a variações como Luxo, Coletiva, etc)
    if (t.includes('APT') || t.includes('APARTAMENTO')) return 'APT';
    if (t.includes('ENF') || t.includes('ENFERMARIA')) return 'ENF';
    
    return t.replace(/[^A-Z0-9 ]/g, '').trim();
  }

  // Atalho para manter compatibilidade com chamadas antigas
  private normalizeTypeName(type: string): string {
    return this.normalizeTipoName(type);
  }

  /**
   * Retorna mapa de pacientes por vínculo geográfico (Setor_Leito).
   * Fonte: vw_taxa_ocupacao_com_pacientes.csv
   */
  public async getPatients(): Promise<Map<string, PatientRecord>> {
    const map = new Map<string, PatientRecord>();
    if (!fs.existsSync(this.ocupacaoFilePath)) return map;
    if (!this.isCsvFile(this.ocupacaoFilePath)) {
      console.warn('[CsvRepo] getPatients: ignorado para fonte não-CSV (use DuckDbService).');
      return map;
    }

    const content = fs.readFileSync(this.ocupacaoFilePath, 'utf8');
    const lines = content.split('\n');
    if (lines.length < 2) return map;

    const parseLine = (line: string) => {
      const result: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuote = !inQuote;
        else if (char === ',' && !inQuote) {
          result.push(cur.trim());
          cur = '';
        } else cur += char;
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const unitIdIdx = headers.indexOf('CD_ESTABELECIMENTO');
    const patientsIdx = headers.indexOf('PACIENTES_ATENDIMENTOS');
    const tipoIdx = headers.indexOf('DS_TIPO_ACOMODACAO');

    if (unitIdIdx === -1 || patientsIdx === -1 || tipoIdx === -1) return map;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const columns = parseLine(line);
        
        let unitId = columns[unitIdIdx] || '0';
        // Aplica Alias de Unidade se necessário
        if (this.UNIT_ID_REMAP[unitId]) unitId = this.UNIT_ID_REMAP[unitId];
        
        const rawTipo = columns[tipoIdx] || 'GERAL';
        const patientsString = columns[patientsIdx];
        const normalizedTipo = this.normalizeTipoName(rawTipo);

        if (!patientsString) continue;

        let currentPatient: PatientRecord | null = null;
        const attributes = patientsString.split('|')
            .map(a => a.trim())
            .filter(a => a !== '');

        for (const attr of attributes) {
            if (attr.includes(' - ') || /^\d+\s*-\s*/.test(attr)) {
                const parts = attr.split(' - ');
                if (parts.length >= 2) {
                    currentPatient = {
                        attendanceId: parts[0].trim(),
                        name: parts[1].trim(),
                    };
                }
                continue;
            }

            if (attr.toUpperCase().includes('LEITO=') && currentPatient) {
                const rawValue = attr.split('=')[1] || '';
                const rawBedName = rawValue.split(';')[0].trim();
                const normalizedBed = this.normalizeBedName(rawBedName);
                
                // ── CHAVE TRIDIMENSIONAL ──
                const mainKey = `${unitId}_${normalizedTipo}_${normalizedBed}`;
                map.set(mainKey, currentPatient);
                currentPatient = null;
            }
        }
    }
    console.log(`[CsvRepo] Pacientes por leito tridimensional: ${map.size} vínculos.`);
    return map;
  }

  /**
   * Retorna disponibilidade dos leitos.
   * Fonte: tbl_ocupacao_internacao.csv
   * Filtro: IE_SITUACAO = 'A' (anti-fantasma)
   */
  public async getAvailability(): Promise<AvailabilityMap> {
    const map: AvailabilityMap = new Map();
    if (!fs.existsSync(this.availabilityFilePath)) return map;
    if (!this.isCsvFile(this.availabilityFilePath)) {
      console.warn('[CsvRepo] getAvailability: ignorado para fonte não-CSV (use DuckDbService).');
      return map;
    }

    return new Promise((resolve) => {
      fs.createReadStream(this.availabilityFilePath)
        .pipe(csv())
        .on('data', (data) => {
          // O paciente é a fonte da verdade — removemos o filtro de inativos aqui
          
          let unitId = data['CD_ESTABELECIMENTO'] || '0';
          // Aplica Alias de Unidade se necessário
          if (this.UNIT_ID_REMAP[unitId]) unitId = this.UNIT_ID_REMAP[unitId];

          const bedRaw    = data['CD_UNIDADE_BASICA'] || data['LEITO'] || '';
          const bedKey    = this.normalizeBedName(bedRaw);
          const rawTipo   = data['CLASSIFICACAO'] || 'GERAL';
          const normalizedTipo = this.normalizeTipoName(rawTipo);
          
          // ── CHAVE TRIDIMENSIONAL ──
          const lookupKey = `${unitId}_${normalizedTipo}_${bedKey}`;

          const rawStatus   = data['STATUS']?.trim().toUpperCase() || 'LIVRE';
          const mappedStatus = STATUS_MAP[rawStatus] || rawStatus;

          const record: AvailabilityRecord = {
            status:       mappedStatus,
            patientId:    data['NR_ATENDIMENTO']?.trim() || null,
            dtAltaMedico: data['DT_ALTA_MEDICO']?.trim() || null,
            dtEntrada:    data['DT_ENTRADA']?.trim() || null,
          };

          map.set(lookupKey, record);
        })
        .on('end', () => resolve(map))
        .on('error', () => resolve(map));
    });
  }

  /**
   * Retorna dados clínicos complementares.
   * Fonte: tbl_intern_internacoes.csv
   */
  public async getComplement(): Promise<ComplementMap> {
    const map: ComplementMap = new Map();
    if (!fs.existsSync(this.complementFilePath)) return map;
    if (!this.isCsvFile(this.complementFilePath)) {
      console.warn('[CsvRepo] getComplement: ignorado para fonte não-CSV (use DuckDbService).');
      return map;
    }

    return new Promise((resolve) => {
      fs.createReadStream(this.complementFilePath)
        .pipe(csv())
        .on('data', (data) => {
          const attendanceId = data['NR_ATENDIMENTO']?.trim();
          if (!attendanceId) return;

          const record: ComplementRecord = {
            age:          data['IDADE']?.trim() || '',
            sex:          data['SEXO']?.trim() || '',
            name:         data['PACIENTE']?.trim() || '',
            dtAltaMedico: data['DT_ALTA_MEDICO']?.trim() || null,
            dtEntrada:    data['DT_ENTRADA']?.trim() || null,
          };
          map.set(attendanceId, record);
        })
        .on('end', () => resolve(map))
        .on('error', () => resolve(map));
    });
  }
}
