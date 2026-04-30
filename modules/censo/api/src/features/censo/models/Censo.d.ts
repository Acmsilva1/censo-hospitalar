export declare enum BedStatus {
    Occupied = "Ocupado",
    Available = "Dispon\u00EDvel",
    Cleaning = "Higieniza\u00E7\u00E3o",
    Maintenance = "Manuten\u00E7\u00E3o",
    Blocked = "Interditado",
    Reserved = "Reservado",
    Inactive = "Inativo"
}
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
export declare function deriveBedFlags(bed: Bed): BedFlags;
//# sourceMappingURL=Censo.d.ts.map