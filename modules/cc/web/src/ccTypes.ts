export type UnitSummary = {
  unitKey: string;
  unitLabel: string;
  hasCenter: boolean;
  referenceDay?: string | null;
  surgeriesInRoom: number;
  waitingRoll: number;
  activeRooms: number;
  completedInScope?: number;
  lastEventAt: string | null;
};

export type UnitsResponse = {
  generatedAt: string;
  referenceDay?: string | null;
  /** MAX(DT_REGISTRO) em UTC antes do offset (fim do lake nos parquet). */
  lakeMaxDayUtc?: string | null;
  /** Dias somados ao fim do lake para o dia âncora do filtro (ex.: -1 = D−1). */
  referenceDayOffsetDays?: number;
  dayScope?: 'global' | 'per_unit';
  units: UnitSummary[];
};

export type ClinicalOutcome = 'ALTA' | 'INTERNACAO' | 'OBITO';

export type RoomPatient = {
  nrCirurgia: string;
  patientName: string;
  procedureName?: string | null;
  doctorName?: string | null;
  /** Opcional nos encerrados (API omite o texto bruto do evento). */
  lastEvent?: string;
  lastEventAt: string | null;
  /** Instantâneo derivado do movimento (entrada na sala / primeiro “em sala”). */
  roomEnteredAt?: string | null;
  /** Instantâneo do término da cirurgia no movimento (encerrados). */
  surgeryEndedAt?: string | null;
  /** Saída do paciente/card da sala cirúrgica (encerrados). */
  roomLeftAt?: string | null;
  state?: string;
  clinicalOutcome?: ClinicalOutcome | null;
};

export type RoomBoard = {
  roomName: string;
  currentPatient: RoomPatient | null;
  waitingPatients: RoomPatient[];
  completedPatients: RoomPatient[];
  inRoomCount: number;
  waitingCount: number;
  completedCount: number;
};

export type RoomsResponse = {
  generatedAt: string;
  referenceDay?: string | null;
  lakeMaxDayUtc?: string | null;
  referenceDayOffsetDays?: number;
  dayScope?: 'global' | 'per_unit';
  unitKey: string;
  rooms: RoomBoard[];
};
