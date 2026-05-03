import { getDataSource } from './SqlDataSource.js';
import { BedStatusService } from './BedStatusService.js';
import type { Bed, CensoState, ParseResult, HospitalStats, FloorStats } from '../models/Censo.js';

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

const HOSPITAL_BLACKLIST = ['CURITIBA', 'CALL CENTER', 'AGUAS CLARAS', 'SALA DE HIGIENIZAÇÃO', '24'];

export class DuckDbParserService {
  private dataSource = getDataSource();

  constructor() {
    
  }

  public async parseDataset(): Promise<ParseResult> {
    console.log('[DuckDB Parser] Iniciando extração via SQL...');

    await this.dataSource.initialize();
    
    // Query consolidada do DuckDB
    const rows = await this.dataSource.query<any>(`SELECT * FROM censo_consolidado`);

    const tree: CensoState = {};

    rows.forEach(row => {
      const hospitalName = UNIT_ID_TO_NAME[row.unitId] || row.hospitalName;
      
      // Blacklist Filter
      if (HOSPITAL_BLACKLIST.some(t => 
        hospitalName.toUpperCase().includes(t) || 
        row.sectorRaw?.toUpperCase().includes(t) || 
        row.unitId === t
      )) {
        return;
      }

      // Lógica de Andar/Área
      let floorOrArea = row.sectorRaw?.split('-')[1]?.trim() || 'Geral';
      
      // Ajuste específico para Campo Grande: "OBSERVAÇÃO" deve aparecer como "ENFERMARIA"
      if (hospitalName.toUpperCase().includes('CAMPO GRANDE') && floorOrArea.toUpperCase().includes('OBSERVA')) {
        floorOrArea = 'ENFERMARIA';
      }

      // Unificação UTI
      const isUti = row.sectorRaw?.includes('UTI') || 
                    row.sectorRaw?.includes('UPC') ||
                    row.rawTipo?.includes('UTI') || 
                    row.rawTipo?.includes('UPC');
      
      if (isUti) floorOrArea = 'UTI';

      const areaType = row.rawTipo || 'Outros';

      // Filtragem de Inativos sem paciente (Garantia anti-fantasma)
      if (row.ieSituacao === 'I' && !row.patientId) return;
      
      // Filtragem específica de leitos inexistentes reportados (somente para Hospital Vitória)
      if ((row.id === '201' || row.id === '201A') && hospitalName.toUpperCase().includes('VITORIA')) return;

      // Status e Emojis
      const status = row.status || 'Disponível';
      const statusEmoji = BedStatusService.getStatusEmoji(status);
      const patientEmoji = BedStatusService.getPatientEmoji(row.patientSex);
      const isIsolation = BedStatusService.checkIsolation(row.id, status);
      const isDischarged = BedStatusService.checkDischarge(status, row.dischargeForecast);
      const stayDuration = BedStatusService.calculateStayDuration(row.admissionDate);

      const bed: Bed = {
        id: row.id,
        status,
        patientId: row.patientId,
        patientName: row.patientName,
        patientAge: row.patientAge,
        patientSex: row.patientSex,
        patientEmoji,
        statusEmoji,
        isIsolation,
        isInactive: row.ieSituacao === 'I', 
        isDischarged,
        stayDuration,
        admissionDate: row.admissionDate,
        dischargeForecast: row.dischargeForecast,
        doctorAdmission: row.doctorAdmission,
        doctorDischarge: row.doctorDischarge,
        isUTI: isUti,
        sectorType: areaType,
      };

      if (!tree[hospitalName]) tree[hospitalName] = {};
      if (!tree[hospitalName][floorOrArea]) tree[hospitalName][floorOrArea] = {};
      if (!tree[hospitalName][floorOrArea][areaType]) tree[hospitalName][floorOrArea][areaType] = [];

      tree[hospitalName][floorOrArea][areaType].push(bed);
    });

    // Ordenação e Estatísticas
    this.sortBeds(tree);
    const stats = this.calculateStats(tree);

    return { tree, stats };
  }

  private sortBeds(tree: CensoState) {
    for (const hosp in tree) {
      for (const floor in tree[hosp]) {
        for (const type in tree[hosp][floor]) {
          (tree[hosp][floor][type] as Bed[]).sort((a, b) =>
            a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' })
          );
        }
      }
    }
  }

  private calculateStats(tree: CensoState): Record<string, HospitalStats> {
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

    return stats;
  }
}
