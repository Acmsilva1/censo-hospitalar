// ============================================================
// ENUMS — Fonte única de verdade para status de leitos
// ============================================================
export enum BedStatus {
  Occupied   = 'Ocupado',
  Available  = 'Disponível',
  Cleaning   = 'Higienização',
  Maintenance = 'Manutenção',
  Blocked    = 'Interditado',
  Reserved   = 'Reservado',
  Inactive   = 'Inativo',
}

// ============================================================
// INTERFACES — Contratos de dados do domínio hospitalar
// ============================================================
export interface Bed {
  id: string;
  status: BedStatus | string;
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
  isReserved: boolean;
  isFree: boolean;
  isInactive: boolean;
  isDischarged: boolean;
  isIsolation: boolean;
}

export interface Area {
  type: string;
  beds: Bed[];
  stats: {
    total: number;
    occupied: number;
    available: number;
    cleaning: number;
    maintenance: number;
  };
}

export interface Floor {
  name: string;
  areas: Record<string, Area>;
}

export interface HospitalData {
  name: string;
  floors: Record<string, Floor>;
  lastUpdate: string;
}

export interface FloorStats {
  occupancyPct: number;
}

export interface HospitalStats {
  globalOccupancyPct: number;
  floors: Record<string, FloorStats>;
}

export interface CensoState {
  [hospitalName: string]: Record<string, Record<string, Bed[]>>;
}

export interface ParseResult {
  tree: CensoState;
  stats: Record<string, HospitalStats>;
}

// ============================================================
// DOMAIN LOGIC — Regras de negócio centralizadas
// Não pertence ao frontend. Use esta função no backend
// e exporte as flags prontas para a View.
// ============================================================
export function deriveBedFlags(bed: Bed): BedFlags {
  return {
    isOccupied:    bed.status === BedStatus.Occupied || !!bed.patientId,
    isCleaning:    bed.status === BedStatus.Cleaning,
    isMaintenance: bed.status === BedStatus.Maintenance || bed.status === BedStatus.Blocked,
    isReserved:    bed.status === BedStatus.Reserved,
    isFree:        bed.status === BedStatus.Available,
    isInactive:    bed.isInactive === true || bed.status === BedStatus.Inactive,
    isDischarged:  bed.isDischarged === true,
    isIsolation:   bed.isIsolation === true,
  };
}
