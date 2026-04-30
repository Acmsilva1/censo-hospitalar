import fs from 'fs';
import csv from 'csv-parser';
import type { Bed, CensoState, ParseResult, HospitalStats, FloorStats } from '../models/Censo.js';
import type { ICensoRepository } from '../repositories/ICensoRepository.js';
import type { CsvCensoRepository } from '../repositories/CsvCensoRepository.js';
import { BedStatusService } from './BedStatusService.js';

// ============================================================
// CsvParserService — Assembler / Mapper
//
// Responsabilidade: montar a árvore CensoState a partir dos
// dados brutos fornecidos pelo ICensoRepository.
// NÃO deve fazer I/O diretamente — delega ao repository.
// ============================================================

const HOSPITAL_BLACKLIST = ['CURITIBA', 'CALL CENTER', 'AGUAS CLARAS', 'SALA DE HIGIENIZAÇÃO', '24'];

const UNIT_ID_REMAP: Record<string, string> = {
  // Removido remap 26->24 pois 26 é o oficial e 24 é apenas clínica
};

const UNIT_ID_TO_NAME: Record<string, string> = {
  '1':  'ES - HOSPITAL VITORIA',
  '13': 'DF - PS SIG',
  '24': 'RJ - BOTAFOGO (CLINICA)',
  '25': 'RJ - PS BARRA DA TIJUCA',
  '26': 'RJ - PS BOTAFOGO',
  '31': 'MG BH GUTIERREZ - PS',
  '33': 'MG - PAMPULHA',
  '39': 'DF - PS TAGUATINGA',
  '45': 'RJ - PS CAMPO GRANDE',
};

function normalizeBedName(name: string): string {
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

function normalizeTypeName(type: string): string {
  if (!type) return 'GERAL';
  const t = type.trim().toUpperCase();
  if (t.includes('UTI') || t.includes('UPC') || t.includes('PACIENTE CRITICO') || t.includes('PACIENTE CRÍTICO')) return 'UTI';
  if (t.includes('APT') || t.includes('APARTAMENTO')) return 'APT';
  if (t.includes('ENF') || t.includes('ENFERMARIA')) return 'ENF';
  return t.replace(/[^A-Z0-9]/g, '');
}

export class CsvParserService {
  private repository: ICensoRepository;
  private masterFilePath: string;

  constructor(repository: ICensoRepository) {
    this.repository = repository;
    // CsvCensoRepository expõe o caminho do master para o assembler
    this.masterFilePath = (repository as CsvCensoRepository).getMasterFilePath?.()
      ?? require('path').resolve(process.cwd(), '../dados/novo censo.csv');
  }

  public async parseDataset(): Promise<ParseResult> {
    console.log('[Parser] Iniciando processamento unificado...');

    // Buscar dados via Repository (CSV ou SQL — transparente para este assembler)
    const [patientMap, availabilityMap, complementMap] = await Promise.all([
      this.repository.getPatients(),
      this.repository.getAvailability(),
      this.repository.getComplement(),
    ]);

    console.log(`[Parser] Pacientes: ${patientMap.size} | Disponibilidade: ${availabilityMap.size} | Complemento: ${complementMap.size}`);

    return new Promise((resolve, reject) => {
      const tree: CensoState = {};
      const processedBedKeys = new Set<string>();
      const sectorToHospitalMap = new Map<string, string>();

      if (!fs.existsSync(this.masterFilePath)) {
        return reject(new Error('[Parser] Arquivo master não encontrado.'));
      }
      if (!this.masterFilePath.toLowerCase().endsWith('.csv')) {
        return reject(
          new Error('[Parser] Master em Parquet — use DuckDbParserService (fluxo DuckDB). CsvParserService só lê CSV.')
        );
      }

      fs.createReadStream(this.masterFilePath)
        .pipe(csv())
        .on('data', (data) => {
          const hospitalName = data['UNIDADE']?.trim() || 'Desconhecido';
          
          // ── Identificação do Leito ──
          let unitId          = data['CD_ESTABELECIMENTO'] || '0';
          if (UNIT_ID_REMAP[unitId]) unitId = UNIT_ID_REMAP[unitId];
          
          const rawBedName     = data['LEITO']?.trim() || 'N/A';
          const normalizedBed  = normalizeBedName(rawBedName);
          const rawTipo        = data['TIPO'] || 'GERAL';
          
          // Unificação de fontes de Setor para Inteligência Geográfica
          const sectorRaw = (data['DS_UNID_FUNC'] || data['SETOR'] || data['DS_SETOR_ATENDIMENTO'] || '').toUpperCase();
          
          const upperTipo      = rawTipo.trim().toUpperCase();
          let normalizedTipo   = upperTipo;

          // ── PREVALÊNCIA GEOGRÁFICA (UTI/UPC) ──
          const isUti = sectorRaw.includes('UTI') || 
                        sectorRaw.includes('UPC') ||
                        sectorRaw.includes('TERAPIA INTENSIVA') || 
                        sectorRaw.includes('PACIENTE CRITICO') || 
                        sectorRaw.includes('PACIENTE CRÍTICO');

          if (isUti) {
            normalizedTipo = 'UTI';
          } 
          else if (upperTipo.includes('BLACK') || upperTipo.includes('BLK')) {
            normalizedTipo = 'APT BLK';
          } 
          else if (upperTipo.includes('APT') || upperTipo.includes('APARTAMENTO')) {
            normalizedTipo = 'APT';
          } 
          else if (upperTipo.includes('ENF') || upperTipo.includes('ENFERMARIA')) {
            normalizedTipo = 'ENF';
          }

          // ── CHAVE TRIDIMENSIONAL ──
          const lookupKey     = `${unitId}_${normalizedTipo}_${normalizedBed}`;

          // Se estiver na blacklist, pula
          if (HOSPITAL_BLACKLIST.some(t => hospitalName.toUpperCase().includes(t) || sectorRaw.includes(t) || unitId === t)) return;

          // Normalização de Áreas
          let floorOrArea = data['DS_SETOR_ATENDIMENTO']?.split('-')[1]?.trim() || 'Geral';
          if (isUti) floorOrArea = 'UTI';

          const areaType = data['TIPO']?.trim() || 'Outros';

          // --- FILTRO INTELIGENTE E LOGICA DE PACIENTE ---
          const geoRecord = patientMap.get(lookupKey);
          const availability = availabilityMap.get(lookupKey);
          const patientId = geoRecord?.attendanceId || availability?.patientId || null;
          
          const isInactiveRaw = data['IE_SITUACAO'] === 'I';

          // REGRA DE OURO: Se for Inativo e Vazio, retira da tela
          if (isInactiveRaw && !patientId) return;

          // ── REGRAS DE EXCEÇÃO: HOSPITAL VITORIA (UNIT 1) ──
          if (unitId === '1') {
             const b = normalizedBed.replace(/\s/g, '');
             // Remapeamento compulsório para UTI
             if (b.includes('ISOL20') || b.includes('ISOL21') || 
                 b.includes('BOX22') || b.includes('BOX23') || b.includes('BOX24') || b.includes('BOX25') || b.includes('BOX26') ||
                 b.includes('UTI17') || b.includes('UTI18') || sectorRaw.includes('UTI EXTRA')) {
                floorOrArea = 'UTI';
             }
          }

          // ── Montar Árvore ──
          const targetHospital = UNIT_ID_TO_NAME[unitId] || hospitalName;

          // ── DEDUPLICAÇÃO GLOBAL (EVITAR LEITOS FANTASMAS) ──
          const dedupKey = `${unitId}_${floorOrArea}_${normalizedBed}`;
          if (processedBedKeys.has(dedupKey)) {
             // Se já temos esse leito mapeado e este novo clone está vazio (Livre), descartamos
             if (!patientId) return;
             
             // Se este clone TEM paciente, precisamos checar o que já está na árvore
             const existingBeds = (tree[targetHospital]?.[floorOrArea]?.[areaType] as Bed[]);
             if (existingBeds) {
                 // Clone exato (mesmo leito, mesmo paciente): ignorar
                 if (existingBeds.some(b => b.id === normalizedBed && b.patientId === patientId)) {
                    return;
                 }
                 
                 // Conflito de Fantasma: O que já estava na árvore era "Livre" (sem paciente), mas agora achamos o registro "Ocupado" verdadeiro
                 const fantasmaLivreIdx = existingBeds.findIndex(b => b.id === normalizedBed && !b.patientId);
                 if (fantasmaLivreIdx !== -1) {
                     existingBeds.splice(fantasmaLivreIdx, 1); // Mata o fantasma livre
                 }
             }
          }

          // ── Dados Clínicos e Status ──
          let rawStatus    = availability?.status ?? (data['STATUS']?.trim() || 'Disponível');
          let status       = BedStatusService.normalizeStatus(rawStatus);
          
          let patientName  = geoRecord?.name || null;
          let patientAge:  string | null = null;
          let patientSex:  string | null = null;
          let patientEmoji: string | null = null;
          let rawDtAlta:   string | null = availability?.dtAltaMedico ?? null;
          let rawDtEntrada: string | null = availability?.dtEntrada ?? null;
          let isDischarged = false;
          let stayDuration = 0;

          // Forçar Ocupado se houver paciente
          if (geoRecord && status !== 'Ocupado' && status !== 'Alta Confirmada') {
            status = 'Ocupado';
          }

          if (patientId) {
            const comp = complementMap.get(patientId);
            if (comp) {
              if (!patientName) patientName = comp.name;
              patientAge = comp.age;
              patientSex = comp.sex;
              if (!rawDtAlta)    rawDtAlta    = comp.dtAltaMedico ?? null;
              if (!rawDtEntrada) rawDtEntrada = comp.dtEntrada ?? null;
              patientEmoji = BedStatusService.getPatientEmoji(patientSex);
            }
          }

          isDischarged = BedStatusService.checkDischarge(status, rawDtAlta);
          stayDuration = BedStatusService.calculateStayDuration(rawDtEntrada);
          const isIsolation = BedStatusService.checkIsolation(normalizedBed, status);
          const statusEmoji = BedStatusService.getStatusEmoji(status);

          if (!tree[targetHospital])                       tree[targetHospital] = {};
          if (!tree[targetHospital][floorOrArea])          tree[targetHospital][floorOrArea] = {};
          if (!tree[targetHospital][floorOrArea][areaType]) tree[targetHospital][floorOrArea][areaType] = [];

          const bed: Bed = {
            id: normalizedBed,
            status,
            patientId,
            patientName,
            patientAge,
            patientSex,
            patientEmoji,
            statusEmoji,
            isIsolation,
            isInactive: isInactiveRaw && !patientId, 
            isDischarged,
            stayDuration,
            admissionDate: rawDtEntrada,
            dischargeForecast: rawDtAlta,
          };

          (tree[targetHospital][floorOrArea][areaType] as Bed[]).push(bed);
          processedBedKeys.add(lookupKey); // Para materialização
          processedBedKeys.add(dedupKey);  // Para deduplicação lógica
        })
        .on('end', () => {
          // ── MATERIALIZAÇÃO DE LEITOS VIRTUAIS (VITÓRIA) ──
          patientMap.forEach((p, key) => {
             const parts = key.split('_'); // Chave 3D: unitId_tipo_bedName
             const uId = parts[0];
             const strTipo = parts[1];
             const bName = parts.slice(2).join('_'); // 3º segmento é o leito
             
             if (uId === '1' && !processedBedKeys.has(key)) {
                const hospitalName = UNIT_ID_TO_NAME['1'];
                const floorOrArea = 'UTI';
                const areaType = 'UTI';
                
                if (!tree[hospitalName]) tree[hospitalName] = {};
                if (!tree[hospitalName][floorOrArea]) tree[hospitalName][floorOrArea] = {};
                if (!tree[hospitalName][floorOrArea][areaType]) tree[hospitalName][floorOrArea][areaType] = [];

                const comp = complementMap.get(p.attendanceId);
                const bed: Bed = {
                   id: bName,
                   status: 'Ocupado',
                   patientId: p.attendanceId,
                   patientName: p.name || comp?.name || null,
                   patientAge: comp?.age || null,
                   patientSex: comp?.sex || null,
                   patientEmoji: BedStatusService.getPatientEmoji(comp?.sex),
                   statusEmoji: BedStatusService.getStatusEmoji('Ocupado'),
                   isIsolation: bName.includes('ISOL') || bName.includes('ISO'),
                   isInactive: false,
                   isDischarged: BedStatusService.checkDischarge('Ocupado', comp?.dtAltaMedico || null),
                   stayDuration: BedStatusService.calculateStayDuration(comp?.dtEntrada || null),
                   admissionDate: comp?.dtEntrada || null,
                   dischargeForecast: comp?.dtAltaMedico || null,
                };
                (tree[hospitalName][floorOrArea][areaType] as Bed[]).push(bed);
             }
          });

          // Ordenação Natural dos leitos
          for (const hosp in tree) {
            for (const floor in tree[hosp]) {
              for (const type in tree[hosp][floor]) {
                (tree[hosp][floor][type] as Bed[]).sort((a, b) =>
                  a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
                );
              }
            }
          }

          // ── CÁLCULO DE ESTATÍSTICAS (OCUPAÇÃO) ──
          const stats: Record<string, HospitalStats> = {};

          for (const hosp in tree) {
            let globalTotal = 0;
            let globalOccupied = 0;
            const floorStats: Record<string, FloorStats> = {};

            for (const floor in tree[hosp]) {
              let floorTotal = 0;
              let floorOccupied = 0;

              for (const type in tree[hosp][floor]) {
                const beds = tree[hosp][floor][type] as Bed[];
                beds.forEach(b => {
                  floorTotal++;
                  globalTotal++;
                  if (b.status === 'Ocupado' || b.isDischarged) {
                    floorOccupied++;
                    globalOccupied++;
                  }
                });
              }

              floorStats[floor] = {
                occupancyPct: floorTotal > 0 ? Math.round((floorOccupied / floorTotal) * 100) : 0
              };
            }

            stats[hosp] = {
              globalOccupancyPct: globalTotal > 0 ? Math.round((globalOccupied / globalTotal) * 100) : 0,
              floors: floorStats
            };
          }

          console.log('[Parser] Mapeador finalizou com sucesso.');
          resolve({ tree, stats });
        })
        .on('error', (err) => reject(err));
    });
  }
}
