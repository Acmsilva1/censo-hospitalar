import type { RoomBoard, RoomPatient, UnitsResponse, UnitSummary } from '../ccTypes';

export const DEMO_UNIT_KEY = 'DEMO_CC_FLUXO';

export function isCcDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (String(import.meta.env.VITE_CC_DEMO || '').toLowerCase() === 'true') return true;
  return new URLSearchParams(window.location.search).get('demo') === '1';
}

function utcToday(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function pt(
  nr: string,
  name: string,
  event: string,
  opts?: {
    roomEnteredAt?: string | null;
    surgeryEndedAt?: string | null;
    roomLeftAt?: string | null;
  },
): RoomPatient {
  return {
    nrCirurgia: nr,
    patientName: name,
    lastEvent: event,
    lastEventAt: new Date().toISOString(),
    roomEnteredAt: opts?.roomEnteredAt ?? undefined,
    surgeryEndedAt: opts?.surgeryEndedAt ?? undefined,
    roomLeftAt: opts?.roomLeftAt ?? undefined,
    state: undefined,
  };
}

/** Ciclo de ~14 fases: espera → em sala (+ espera na fila) → encerrado → novo caso. */
function roomStory(roomName: string, tickOffset: number, tick: number): RoomBoard {
  const phase = (((tick + tickOffset) % 14) + 14) % 14;

  const emptyBase = (): Omit<RoomBoard, 'roomName'> => ({
    currentPatient: null,
    waitingPatients: [],
    completedPatients: [],
    inRoomCount: 0,
    waitingCount: 0,
    completedCount: 0,
  });

  if (phase <= 2) {
    const w =
      roomName.includes('01')
        ? [pt('DEMO-501', 'Paciente em espera (sim.)', 'Entrada no centro cirúrgico')]
        : [pt('DEMO-601', 'Outro caso (sim.)', 'Aguardando sala')];
    return {
      roomName,
      ...emptyBase(),
      waitingPatients: w,
      waitingCount: w.length,
    };
  }

  if (phase <= 6) {
    const cur =
      roomName.includes('01')
        ? pt('DEMO-501', 'Paciente em procedimento (sim.)', 'Início de cirurgia', {
            roomEnteredAt: isoMinutesAgo(52),
          })
        : pt('DEMO-601', 'Paciente em procedimento (sim.)', 'Início da anestesia', {
            roomEnteredAt: isoMinutesAgo(38),
          });
    const w =
      roomName.includes('01')
        ? [pt('DEMO-502', 'Próximo na fila (sim.)', 'Paciente no centro cirúrgico')]
        : [];
    return {
      roomName,
      currentPatient: cur,
      waitingPatients: w,
      completedPatients: [],
      inRoomCount: 1,
      waitingCount: w.length,
      completedCount: 0,
    };
  }

  if (phase <= 9) {
    const done =
      roomName.includes('01')
        ? [
            pt('DEMO-501', 'Paciente finalizado (sim.)', 'Saída do paciente para casa', {
              surgeryEndedAt: isoMinutesAgo(95),
            }),
          ]
        : [
            pt('DEMO-601', 'Paciente finalizado (sim.)', 'Saída do paciente da sala cirúrgica', {
              surgeryEndedAt: isoMinutesAgo(72),
            }),
          ];
    const cur =
      roomName.includes('01')
        ? pt('DEMO-502', 'Novo procedimento (sim.)', 'Entrada na sala cirúrgica', {
            roomEnteredAt: isoMinutesAgo(12),
          })
        : pt('DEMO-602', 'Novo procedimento (sim.)', 'Término da cirurgia', {
            roomEnteredAt: isoMinutesAgo(25),
          });
    const w = roomName.includes('01') ? [pt('DEMO-503', 'Roll ativo (sim.)', 'Checklist cirúrgico')] : [];
    return {
      roomName,
      currentPatient: cur,
      waitingPatients: w,
      completedPatients: done,
      inRoomCount: 1,
      waitingCount: w.length,
      completedCount: done.length,
    };
  }

  const done =
    roomName.includes('01')
      ? [
          pt('DEMO-502', 'Encerrado (sim.)', 'Saída do paciente para casa', {
            surgeryEndedAt: isoMinutesAgo(110),
            roomLeftAt: isoMinutesAgo(107),
          }),
          pt('DEMO-501', 'Caso anterior (sim.)', 'Alta médica', {
            surgeryEndedAt: isoMinutesAgo(180),
            roomLeftAt: isoMinutesAgo(175),
          }),
        ]
      : [
          pt('DEMO-602', 'Encerrado (sim.)', 'Saída do paciente para UI', {
            surgeryEndedAt: isoMinutesAgo(130),
          }),
        ];
  return {
    roomName,
    currentPatient: null,
    waitingPatients: roomName.includes('01')
      ? [pt('DEMO-504', 'Chegada recente (sim.)', 'Chegada ao centro cirúrgico')]
      : [pt('DEMO-603', 'Chegada recente (sim.)', 'Entrada no centro cirúrgico')],
    completedPatients: done,
    inRoomCount: 0,
    waitingCount: 1,
    completedCount: done.length,
  };
}

export function buildDemoRooms(unitKey: string, tick: number): RoomBoard[] {
  if (unitKey !== DEMO_UNIT_KEY) return [];
  return [roomStory('SALA - 01', 0, tick), roomStory('SALA - 02', 5, tick)];
}

export function buildDemoUnitsResponse(tick: number): UnitsResponse {
  const rooms = buildDemoRooms(DEMO_UNIT_KEY, tick);
  let surgeriesInRoom = 0;
  let waitingRoll = 0;
  let completedInScope = 0;
  let activeRooms = 0;
  for (const r of rooms) {
    surgeriesInRoom += r.inRoomCount;
    waitingRoll += r.waitingCount;
    completedInScope += r.completedCount;
    if (r.inRoomCount > 0) activeRooms += 1;
  }

  const u: UnitSummary = {
    unitKey: DEMO_UNIT_KEY,
    unitLabel: 'Exemplo ao vivo (simulação)',
    hasCenter: true,
    referenceDay: utcToday(),
    surgeriesInRoom,
    waitingRoll,
    activeRooms,
    completedInScope,
    lastEventAt: new Date().toISOString(),
  };

  return {
    generatedAt: new Date().toISOString(),
    referenceDay: utcToday(),
    dayScope: 'per_unit',
    units: [u],
  };
}

/** Junta a unidade de exemplo ao fim da lista (modo real + exemplo). */
export function mergeDemoUnitIntoList(realUnits: UnitSummary[], tick: number): UnitSummary[] {
  const demo = buildDemoUnitsResponse(tick).units[0];
  const rest = realUnits.filter((u) => u.unitKey !== DEMO_UNIT_KEY);
  return [...rest, demo];
}
