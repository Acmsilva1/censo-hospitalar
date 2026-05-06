import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomBoard, RoomsResponse, UnitsResponse } from './ccTypes';
import { clinicalOutcomeLabelPt, inferClinicalOutcome } from './clinicalOutcome';
import { buildDemoRooms, buildDemoUnitsResponse, DEMO_UNIT_KEY, isCcDemoMode } from './demo/liveSimulation';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3213';

const UNIT_COLORS: string[] = [
  '#5fd2ff',
  '#61a8ff',
  '#7aa7ff',
  '#7cd8f6',
  '#77c3ff',
  '#72b5ff',
  '#6dc9ff',
  '#88b8ff',
  '#8fd8ff',
];

function formatTime(value: string | null) {
  if (!value) return 'Sem atualização';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sem atualização';
  return d.toLocaleString('pt-BR');
}

function formatCompletedMoment(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function colorForUnit(unitKey: string, index: number) {
  let hash = 0;
  for (let i = 0; i < unitKey.length; i++) hash += unitKey.charCodeAt(i);
  return UNIT_COLORS[(hash + index) % UNIT_COLORS.length];
}

export function App() {
  const [demoActive] = useState(() => isCcDemoMode());
  const [demoTick, setDemoTick] = useState(0);

  const [units, setUnits] = useState<UnitsResponse['units']>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>(() => (isCcDemoMode() ? DEMO_UNIT_KEY : ''));
  const [rooms, setRooms] = useState<RoomBoard[]>([]);
  const [pulseRooms, setPulseRooms] = useState<Record<string, number>>({});
  const previousRoomPatientRef = useRef<Record<string, string>>({});
  const pulseTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const ingestRooms = useCallback((nextRooms: RoomBoard[]) => {
    const prevMap = previousRoomPatientRef.current;
    const map: Record<string, string> = {};
    const changedRooms: string[] = [];
    for (const room of nextRooms) {
      const prevId = prevMap[room.roomName] || '';
      const currentId = room.currentPatient?.nrCirurgia || '';
      map[room.roomName] = currentId;
      if (prevId && currentId && prevId !== currentId) changedRooms.push(room.roomName);
    }
    previousRoomPatientRef.current = map;
    setRooms(nextRooms);

    if (changedRooms.length === 0) return;
    setPulseRooms((prev) => {
      const next = { ...prev };
      const marker = Date.now();
      for (const roomName of changedRooms) next[roomName] = marker;
      return next;
    });
    for (const roomName of changedRooms) {
      if (pulseTimersRef.current[roomName]) clearTimeout(pulseTimersRef.current[roomName]);
      pulseTimersRef.current[roomName] = setTimeout(() => {
        setPulseRooms((prev) => {
          const next = { ...prev };
          delete next[roomName];
          return next;
        });
      }, 2800);
    }
  }, []);

  useEffect(() => {
    if (demoActive) return;
    let disposed = false;

    async function fetchUnits() {
      const res = await fetch(`${API_BASE}/api/cc/units`);
      const json = (await res.json()) as UnitsResponse;
      if (disposed) return;
      setUnits(json.units || []);
      if (!selectedUnit) {
        const firstWithCenter = (json.units || []).find((u) => u.hasCenter);
        if (firstWithCenter) setSelectedUnit(firstWithCenter.unitKey);
      }
    }

    void fetchUnits();
    const timer = setInterval(() => void fetchUnits(), 15000);

    let ws: WebSocket | null = null;
    try {
      const wsBase = API_BASE.replace(/^http/i, 'ws');
      ws = new WebSocket(`${wsBase}/ws/cc-state`);
      ws.onmessage = (event) => {
        if (disposed) return;
        const data = JSON.parse(String(event.data || '{}')) as { snapshot?: UnitsResponse };
        if (data.snapshot?.units) {
          setUnits(data.snapshot.units);
        }
      };
    } catch {
      /* polling cobre */
    }

    return () => {
      disposed = true;
      clearInterval(timer);
      if (ws) ws.close();
    };
  }, [demoActive, selectedUnit]);

  useEffect(() => {
    if (!demoActive) return;
    const id = window.setInterval(() => setDemoTick((n) => n + 1), 4500);
    return () => clearInterval(id);
  }, [demoActive]);

  useEffect(() => {
    if (!demoActive) return;
    const u = buildDemoUnitsResponse(demoTick);
    setUnits(u.units);
  }, [demoActive, demoTick]);

  useEffect(() => {
    if (!demoActive) return;
    if (selectedUnit !== DEMO_UNIT_KEY) return;
    const raw = buildDemoRooms(selectedUnit, demoTick);
    const nextRooms = raw.map((r) => ({
      ...r,
      completedPatients: r.completedPatients ?? [],
      completedCount: r.completedCount ?? 0,
    }));
    ingestRooms(nextRooms);
  }, [demoActive, selectedUnit, demoTick, ingestRooms]);

  const visibleUnits = useMemo(() => units.filter((unit) => unit.hasCenter), [units]);
  const selectedSummary = useMemo(() => visibleUnits.find((u) => u.unitKey === selectedUnit) || null, [selectedUnit, visibleUnits]);

  useEffect(() => {
    if (!selectedUnit || !visibleUnits.some((u) => u.unitKey === selectedUnit)) {
      const first = visibleUnits[0];
      if (first) setSelectedUnit(first.unitKey);
    }
  }, [visibleUnits, selectedUnit]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(pulseTimersRef.current)) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (demoActive) return;
    if (selectedUnit === DEMO_UNIT_KEY) return;
    let disposed = false;
    if (!selectedUnit) {
      setRooms([]);
      return;
    }

    async function fetchRooms() {
      const res = await fetch(`${API_BASE}/api/cc/rooms?unit=${encodeURIComponent(selectedUnit)}`);
      const json = (await res.json()) as RoomsResponse;
      if (disposed) return;
      const nextRooms = (json.rooms || []).map((r) => ({
        ...r,
        completedPatients: r.completedPatients ?? [],
        completedCount: r.completedCount ?? 0,
      }));
      ingestRooms(nextRooms);
    }

    void fetchRooms();
    const timer = setInterval(() => void fetchRooms(), 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [demoActive, selectedUnit, ingestRooms]);

  return (
    <div className="cc-page">
      <header className="cc-header">
        <h1>Centro Cirúrgico</h1>
      </header>

      <section className="cc-units">
        {visibleUnits.map((unit, index) => {
          const tone = colorForUnit(unit.unitKey, index);
          const selected = unit.unitKey === selectedUnit;
          return (
            <button
              key={unit.unitKey}
              className={`cc-unit-pill ${selected ? 'is-selected' : ''}`}
              onClick={() => setSelectedUnit(unit.unitKey)}
              style={{ ['--cc-tone' as string]: tone }}
              title="Abrir unidade"
            >
              <span className="cc-unit-emoji" aria-hidden>
                🏥
              </span>
              <span className="cc-unit-label">{unit.unitLabel}</span>
              <span className="cc-unit-badge">CC</span>
            </button>
          );
        })}
      </section>

      {visibleUnits.length === 0 && (
        <section className="cc-rooms">
          <div className="cc-empty">Nenhuma unidade disponível.</div>
        </section>
      )}

      {selectedSummary && (
        <section className="cc-summary">
          <article>
            <strong>{selectedSummary.surgeriesInRoom}</strong>
            <span>Em sala agora</span>
          </article>
          <article>
            <strong>{selectedSummary.waitingRoll}</strong>
            <span>No roll de espera</span>
          </article>
          <article>
            <strong>{selectedSummary.activeRooms}</strong>
            <span>Salas ocupadas</span>
          </article>
          <article>
            <strong>{selectedSummary.completedInScope ?? 0}</strong>
            <span>Encerrados</span>
          </article>
        </section>
      )}

      <section className="cc-rooms">
        {rooms.length === 0 ? (
          <div className="cc-empty">Sem salas para esta unidade.</div>
        ) : (
          rooms.map((room, index) => (
            <motion.article
              key={room.roomName}
              className={`cc-room-column ${pulseRooms[room.roomName] ? 'is-pulsing' : ''}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: index * 0.08 }}
              layout
            >
              <motion.div className="cc-room-main-card" layout>
                <header>
                  <span className="cc-room-tag">{room.roomName}</span>
                  <strong>{room.inRoomCount > 0 ? 'Em sala agora' : 'Sala vazia'}</strong>
                </header>
                <AnimatePresence mode="wait">
                  {room.currentPatient ? (
                    <motion.div
                      key={room.currentPatient.nrCirurgia}
                      className="cc-current-patient-wrap"
                      initial={{ opacity: 0, y: 18, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -12, scale: 0.98 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    >
                      <h3>{room.currentPatient.patientName}</h3>
                      <small>{room.currentPatient.lastEvent}</small>
                      <small>
                        Entrada na sala:{' '}
                        {formatTime(
                          room.currentPatient.roomEnteredAt ?? room.currentPatient.lastEventAt,
                        )}
                      </small>
                    </motion.div>
                  ) : (
                    <motion.p
                      key="empty-room"
                      className="cc-room-empty-quiet"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                    >
                      —
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>

              <motion.div className="cc-room-waiting-card" layout>
                <header>
                  <strong>Roll de espera</strong>
                  <span>{room.waitingCount}</span>
                </header>
                {room.waitingPatients.length === 0 ? (
                  <p className="cc-empty-inline">—</p>
                ) : (
                  <motion.div className="cc-waiting-list" layout>
                    {room.waitingPatients.map((patient) => (
                      <motion.article
                        key={patient.nrCirurgia}
                        className="cc-waiting-item"
                        layout
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <h4>{patient.patientName}</h4>
                        <small>{patient.lastEvent}</small>
                      </motion.article>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              <motion.div className="cc-room-completed-card" layout>
                <header>
                  <strong>Encerrados neste dia</strong>
                  <span>{room.completedCount}</span>
                </header>
                {room.completedPatients.length === 0 ? (
                  <p className="cc-empty-inline">—</p>
                ) : (
                  <motion.div className="cc-waiting-list" layout>
                    {room.completedPatients.map((patient) => {
                      const outcome =
                        patient.clinicalOutcome ?? inferClinicalOutcome(patient.lastEvent);
                      return (
                        <motion.article
                          key={patient.nrCirurgia}
                          className="cc-completed-item"
                          layout
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25 }}
                        >
                          <h4>{patient.patientName}</h4>
                          {outcome ? (
                            <small className="cc-outcome-desfecho">{clinicalOutcomeLabelPt(outcome)}</small>
                          ) : null}
                          <small className="cc-outcome-hora">
                            Saída da sala:{' '}
                            {formatCompletedMoment(
                              patient.roomLeftAt ??
                                patient.surgeryEndedAt ??
                                patient.lastEventAt,
                            )}
                          </small>
                        </motion.article>
                      );
                    })}
                  </motion.div>
                )}
              </motion.div>
            </motion.article>
          ))
        )}
      </section>
    </div>
  );
}
