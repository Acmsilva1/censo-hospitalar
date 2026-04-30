// ============================================================
// census.d.ts — Tipos do domínio hospitalar (Frontend)
//
// Espelho dos Models da API (`api/src/features/censo/models/Censo.ts`).
// Fonte única de verdade de tipos para todo o frontend.
// ============================================================

export const BedStatus = {
  Occupied:    'Ocupado',
  Available:   'Disponível',
  Cleaning:    'Higienização',
  Maintenance: 'Manutenção',
  Blocked:     'Interditado',
  Reserved:    'Reservado',
  Inactive:    'Inativo',
} as const;

export type BedStatusType = typeof BedStatus[keyof typeof BedStatus];

export interface Bed {
  id: string;
  status: BedStatusType | string;
  patientId: string | null;
  patientName: string | null;
  patientAge?: string | null;
  patientSex?: string | null;
  patientEmoji?: string | null;
  statusEmoji?: string | null;
  isIsolation?: boolean;
  isInactive?: boolean;
  isDischarged?: boolean;
  stayDuration?: number;
  admissionDate?: string | null;
  dischargeForecast?: string | null;
  doctorAdmission?: string | null;
  doctorDischarge?: string | null;
  isUTI?: boolean;
  sectorType?: string;
}

export interface BedFlags {
  isOccupied: boolean;
  isCleaning: boolean;
  isMaintenance: boolean;
  isInterdicted: boolean;
  isReserved: boolean;
  isFree: boolean;
  isInactive: boolean;
  isDischarged: boolean;
  isIsolation: boolean;
}

/** Deriva os flags de display de um leito — lógica centralizada no frontend */
export function deriveBedFlags(bed: Bed): BedFlags {
  return {
    isOccupied:    bed.status === BedStatus.Occupied || !!bed.patientId,
    isCleaning:    bed.status === BedStatus.Cleaning,
    isMaintenance: bed.status === BedStatus.Maintenance,
    isInterdicted: bed.status === BedStatus.Blocked,
    isReserved:    bed.status === BedStatus.Reserved,
    isFree:        bed.status === BedStatus.Available,
    isInactive:    bed.isInactive === true || bed.status === BedStatus.Inactive,
    isDischarged:  bed.isDischarged === true,
    isIsolation:   bed.isIsolation === true,
  };
}

export type AreaData  = Record<string, Bed[]>;
export type FloorData = Record<string, AreaData>;
export type CensoData = Record<string, FloorData>;

export interface FloorStats {
  occupancyPct: number;
}

export interface HospitalStats {
  globalOccupancyPct: number;
  floors: Record<string, FloorStats>;
}

export interface CensoPayload {
  data: CensoData;
  stats?: HospitalStats;
  lastUpdate: string;
  nextUpdate: string;
}
