import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { HospitalBuilding3D, type BuildingFloor3D } from './HospitalBuilding3D';
import { HospitalFloorInterior3D } from './HospitalFloorInterior3D';

type VisaoHospitalarProps = {
  censoApiUrl: string;
  jornadaApiUrl: string;
};

type UnitOption = { id: string; label: string };

type Bed = {
  id: string;
  status?: string;
  patientId?: string | null;
};

type AreaData = Record<string, Bed[]>;
type FloorData = Record<string, AreaData>;
type CensoData = Record<string, FloorData>;

type StageKey =
  | 'TRIAGEM'
  | 'CONSULTA'
  | 'LABORATORIO'
  | 'IMAGEM'
  | 'MEDICACAO'
  | 'REAVALIACAO';

type StageStat = {
  key: StageKey;
  label: string;
  count: number;
  pct: number;
};

type FloorKind = 'PS' | 'INTERNACAO' | 'UTI_UPC' | 'APOIO';

type FloorModel = {
  id: string;
  label: string;
  kind: FloorKind;
  occupied: number;
  total: number;
  pct: number;
  beds: Bed[];
  sectors?: Array<{
    name: string;
    occupied: number;
    total: number;
    beds: Bed[];
  }>;
};

function floorPressureLabel(pct: number) {
  if (pct >= 85) return 'Critico';
  if (pct >= 65) return 'Atencao';
  return 'Estavel';
}

const STAGE_LABELS: Record<StageKey, string> = {
  TRIAGEM: 'Triagem',
  CONSULTA: 'Consulta',
  LABORATORIO: 'Laboratorio',
  IMAGEM: 'RX / US / TC',
  MEDICACAO: 'Medicacao',
  REAVALIACAO: 'Reavaliacao',
};

const STAGE_ORDER: StageKey[] = ['TRIAGEM', 'CONSULTA', 'LABORATORIO', 'IMAGEM', 'MEDICACAO', 'REAVALIACAO'];
const BASE_UNITS: string[] = [
  'ES - HOSPITAL VITORIA',
  'ES - PS VV',
  'RJ - PS CAMPO GRANDE',
  'RJ - PS BOTAFOGO',
  'RJ - PS BARRA DA TIJUCA',
  'DF - PS SIG',
  'DF - PS TAGUATINGA',
  'MG BH GUTIERREZ - PS',
  'MG - PAMPULHA',
];

function normalizeText(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(HOSPITAL|PS|PRONTO|SOCORRO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSlug(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function classifyFloor(raw: string, beds: Bed[]): FloorKind {
  const text = normalizeText(raw);
  if (text.includes('UTI') || text.includes('UPC')) return 'UTI_UPC';
  if (text.includes('ENFER') || text.includes('INTER') || text.includes('APTO') || text.includes('APT')) return 'INTERNACAO';
  const hasUtiBeds = beds.some((b) => normalizeText(b.id || '').includes('UTI') || normalizeText(b.id || '').includes('UPC'));
  if (hasUtiBeds) return 'UTI_UPC';
  return 'INTERNACAO';
}

function extractFloorNumber(raw: string): number | null {
  const up = normalizeText(raw);
  const byAndar = up.match(/(\d+)\s*ANDAR/);
  if (byAndar?.[1]) return Number(byAndar[1]);
  const byOrdinal = raw.match(/(\d+)\s*[º°]/);
  if (byOrdinal?.[1]) return Number(byOrdinal[1]);
  return null;
}

function isBedLike(value: unknown): value is Bed {
  return Boolean(value && typeof value === 'object' && 'id' in (value as Record<string, unknown>));
}

function collectBedsDeep(node: unknown, out: Bed[]) {
  if (Array.isArray(node)) {
    for (const item of node) {
      if (isBedLike(item)) out.push(item);
      else collectBedsDeep(item, out);
    }
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const child of Object.values(node as Record<string, unknown>)) {
    if (isBedLike(child)) out.push(child);
    else collectBedsDeep(child, out);
  }
}

function flattenBeds(node: unknown): Bed[] {
  const out: Bed[] = [];
  collectBedsDeep(node, out);
  return out.filter((b) => b && typeof b.id === 'string' && b.id.trim().length > 0);
}

function isBedOccupied(bed: Bed) {
  const status = normalizeText(String(bed.status || ''));
  return Boolean(bed.patientId) || status.includes('OCUPADO') || status.includes('RESERVADO') || status.includes('PACIENTE');
}

function pressureBand(pct: number) {
  if (pct >= 80) return 'high';
  if (pct >= 55) return 'mid';
  return 'low';
}

function matchJourneyUnit(hospital: string, units: string[]) {
  if (!units.length) return '';
  if (units.includes(hospital)) return hospital;
  const target = normalizeText(hospital);
  let best = units[0];
  let bestScore = -1;
  for (const unit of units) {
    const norm = normalizeText(unit);
    const targetTokens = target.split(' ');
    let score = 0;
    for (const token of targetTokens) {
      if (token.length < 2) continue;
      if (norm.includes(token)) score += 2;
    }
    if (norm.slice(0, 2) === target.slice(0, 2)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = unit;
    }
  }
  return best;
}

function displayUnitName(raw: string) {
  const t = normalizeText(raw);
  if (t.includes('PS VV') || t.includes('PS VILA VELHA') || t.includes('VILA VELHA')) return 'ES - PS VV';
  if (t.includes('HOSPITAL VITORIA') || (t.includes('PS') && t.includes('VITORIA'))) return 'ES - PS Vitoria';
  return raw;
}

function canonicalUnitKey(raw: string) {
  const t = normalizeText(raw);
  if (t.includes('PS VV') || t.includes('PS VILA VELHA') || t.includes('VILA VELHA')) return 'ES_PS_VV';
  if (t.includes('HOSPITAL VITORIA') || (t.includes('PS') && t.includes('VITORIA'))) return 'ES_HOSPITAL_VITORIA';
  if (t.includes('PS BOTAFOGO')) return 'RJ_PS_BOTAFOGO';
  if (t.includes('PS CAMPO GRANDE')) return 'RJ_PS_CAMPO_GRANDE';
  if (t.includes('PS BARRA DA TIJUCA')) return 'RJ_PS_BARRA_DA_TIJUCA';
  if (t.includes('PS SIG')) return 'DF_PS_SIG';
  if (t.includes('PS TAGUATINGA')) return 'DF_PS_TAGUATINGA';
  if (t.includes('GUTIERREZ')) return 'MG_GUTIERREZ';
  if (t.includes('PAMPULHA')) return 'MG_PAMPULHA';
  return t;
}

export function VisaoHospitalar({ censoApiUrl, jornadaApiUrl }: VisaoHospitalarProps) {
  const [mode, setMode] = useState<'units' | 'building' | 'floor'>('units');
  const [hospitals, setHospitals] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<string>('');
  const [jornadaUnits, setJornadaUnits] = useState<string[]>([]);
  const [jornadaUnavailable, setJornadaUnavailable] = useState(false);
  const [censoData, setCensoData] = useState<CensoData | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [psStats, setPsStats] = useState<StageStat[]>([]);
  const [psTotalActive, setPsTotalActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setUnitsLoading(true);
    fetch(`${censoApiUrl}/api/hospitals`)
      .then((r) => r.json())
      .catch(() => [])
      .then((censoList) => {
        if (cancelled) return;
        const merged = [
          ...(Array.isArray(censoList) ? censoList : []),
          ...BASE_UNITS,
        ]
          .filter(Boolean)
          .map(String);
        const byNorm = new Map<string, string>();
        for (const id of merged) {
          const key = canonicalUnitKey(id);
          if (!key) continue;
          if (!byNorm.has(key)) byNorm.set(key, id);
        }
        const uniq = Array.from(byNorm.values());
        uniq.sort((a, b) => normalizeText(a).localeCompare(normalizeText(b)));
        const mapped = uniq.map((id) => ({ id, label: displayUnitName(id) }));

        const byLabel = new Map<string, UnitOption>();
        for (const item of mapped) {
          const labelKey = normalizeText(item.label);
          if (!labelKey) continue;
          if (!byLabel.has(labelKey)) byLabel.set(labelKey, item);
        }
        setHospitals(Array.from(byLabel.values()));
        setUnitsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setHospitals(
            BASE_UNITS.map((id) => ({
              id,
              label: displayUnitName(id),
            }))
          );
          setUnitsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [censoApiUrl, jornadaApiUrl]);

  useEffect(() => {
    if (!selectedHospital) return;
    let mounted = true;
    const socket: Socket = io(censoApiUrl, { transports: ['websocket', 'polling'], reconnection: true });

    socket.on('connect', () => {
      socket.emit('join-hospital', selectedHospital);
    });

    socket.on('censo-initial-state', (payload: { data?: CensoData }) => {
      if (!mounted || !payload?.data) return;
      setCensoData(payload.data);
    });

    socket.on('censo-error', () => {
      if (mounted) setCensoData(null);
    });

    return () => {
      mounted = false;
      socket.emit('leave-hospital', selectedHospital);
      socket.disconnect();
    };
  }, [censoApiUrl, selectedHospital]);

  useEffect(() => {
    if (!selectedHospital) return;
    if (jornadaUnavailable) {
      setPsTotalActive(0);
      setPsStats(STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key], count: 0, pct: 0 })));
      return;
    }
    let cancelled = false;

    async function loadPsStats() {
      try {
        let units = jornadaUnits;
        if (!units.length) {
          const unitsRes = await fetch(`${jornadaApiUrl}/api/units`);
          const unitsJson = await unitsRes.json();
          units = Array.isArray(unitsJson) ? unitsJson.map(String) : [];
          if (units.length > 0) {
            setJornadaUnits(units);
            setJornadaUnavailable(false);
          }
        }
        if (!units.length) {
          setPsTotalActive(0);
          setPsStats(STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key], count: 0, pct: 0 })));
          return;
        }
        const unit = matchJourneyUnit(selectedHospital, Array.isArray(units) ? units : []);
        if (!unit) return;

        const patientsRes = await fetch(`${jornadaApiUrl}/api/patients?unit=${encodeURIComponent(unit)}`);
        const patients = (await patientsRes.json()) as Array<{ NR_ATENDIMENTO: string; DT_DESFECHO?: string | null }>;
        const active = (patients || []).filter((p) => !p.DT_DESFECHO).slice(0, 60);
        if (cancelled) return;

        const counters = new Map<StageKey, number>(STAGE_ORDER.map((k) => [k, 0]));

        const journeys = await Promise.allSettled(
          active.map((p) => fetch(`${jornadaApiUrl}/api/journey/${encodeURIComponent(p.NR_ATENDIMENTO)}`).then((r) => r.json()))
        );

        for (const result of journeys) {
          if (result.status !== 'fulfilled') continue;
          const steps = Array.isArray(result.value?.steps) ? result.value.steps : [];
          const filtered = steps.filter((s: any) => s?.step && s.step !== 'ALTA' && s.step !== 'INTERNACAO');
          const last = filtered[filtered.length - 1];
          const step = String(last?.step || '');
          if (STAGE_ORDER.includes(step as StageKey)) {
            counters.set(step as StageKey, (counters.get(step as StageKey) || 0) + 1);
          }
        }

        const total = Array.from(counters.values()).reduce((a, b) => a + b, 0);
        const stageStats: StageStat[] = STAGE_ORDER.map((key) => {
          const count = counters.get(key) || 0;
          return {
            key,
            label: STAGE_LABELS[key],
            count,
            pct: total > 0 ? Math.round((count / total) * 100) : 0,
          };
        });

        if (!cancelled) {
          setPsTotalActive(total);
          setPsStats(stageStats);
        }
      } catch {
        if (!cancelled) {
          setJornadaUnavailable(true);
          setPsTotalActive(0);
          setPsStats(STAGE_ORDER.map((key) => ({ key, label: STAGE_LABELS[key], count: 0, pct: 0 })));
        }
      }
    }

    void loadPsStats();
    return () => {
      cancelled = true;
    };
  }, [jornadaApiUrl, selectedHospital, jornadaUnavailable, jornadaUnits]);

  const floors = useMemo<FloorModel[]>(() => {
    const models: FloorModel[] = [];
    const unitSlug = toSlug(selectedHospital || 'unit');

    const psOccupied = psTotalActive;
    const psTotal = Math.max(1, psTotalActive);
    models.push({
      id: `${unitSlug}_ps_f1`,
      label: '1º Andar - Pronto Socorro',
      kind: 'PS',
      occupied: psOccupied,
      total: psTotal,
      pct: psTotal > 0 ? Math.min(100, Math.round((psOccupied / psTotal) * 100)) : 0,
      beds: [],
    });

    if (!censoData) return models;

    const floorKeys = Object.keys(censoData).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const grouped = new Map<
      number,
      {
        names: string[];
        kind: FloorKind;
        sectors: Array<{ name: string; occupied: number; total: number; beds: Bed[] }>;
      }
    >();
    const deferred: Array<{
      sourceName: string;
      kind: FloorKind;
      sectors: Array<{ name: string; occupied: number; total: number; beds: Bed[] }>;
    }> = [];

    for (const floorKey of floorKeys) {
      const floorData = censoData[floorKey] || {};
      const sectors: Array<{ name: string; occupied: number; total: number; beds: Bed[] }> = [];

      for (const [sectorName, areaData] of Object.entries(floorData)) {
        const beds = flattenBeds(areaData);
        if (beds.length === 0) continue;
        const occupied = beds.filter(isBedOccupied).length;
        sectors.push({ name: sectorName, occupied, total: beds.length, beds });
      }

      if (sectors.length === 0) continue;
      const bedsAll = sectors.flatMap((s) => s.beds);
      const kind = classifyFloor(floorKey, bedsAll);
      const floorNo = extractFloorNumber(floorKey);

      if (floorNo && floorNo > 1) {
        const current = grouped.get(floorNo) || { names: [], kind, sectors: [] as typeof sectors };
        current.names.push(floorKey);
        current.sectors.push(...sectors);
        if (current.kind !== 'UTI_UPC' && kind === 'UTI_UPC') current.kind = 'UTI_UPC';
        grouped.set(floorNo, current);
      } else {
        deferred.push({ sourceName: floorKey, kind, sectors });
      }
    }

    let nextFloor = Math.max(1, ...Array.from(grouped.keys())) + 1;
    for (const item of deferred) {
      while (grouped.has(nextFloor)) nextFloor += 1;
      grouped.set(nextFloor, { names: [item.sourceName], kind: item.kind, sectors: item.sectors });
      nextFloor += 1;
    }

    for (const [floorNo, item] of Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])) {
      const beds = item.sectors.flatMap((s) => s.beds);
      const total = beds.length;
      if (total === 0) continue;
      const occupied = item.sectors.reduce((sum, s) => sum + s.occupied, 0);
      const pct = Math.round((occupied / total) * 100);
      const mainName = item.kind === 'UTI_UPC' ? 'UTI / UPC' : 'Internacao';
      models.push({
        id: `${unitSlug}_${toSlug(item.names.join('_'))}_f${floorNo}`,
        label: `${floorNo}º Andar - ${mainName}`,
        kind: item.kind,
        occupied,
        total,
        pct,
        beds,
        sectors: item.sectors,
      });
    }

    return models;
  }, [censoData, psTotalActive, selectedHospital]);

  const selectedFloor = useMemo(
    () => floors.find((f) => f.id === selectedFloorId) || null,
    [floors, selectedFloorId]
  );

  const currentHospitalLabel = selectedHospital ? displayUnitName(selectedHospital) : 'Selecione uma unidade';
  const buildingFloors3d = useMemo<BuildingFloor3D[]>(
    () =>
      floors.map((f) => ({
        id: f.id,
        label: f.label,
        pct: f.pct,
        occupied: f.occupied,
        free: Math.max(0, f.total - f.occupied),
        band: pressureBand(f.pct),
      })),
    [floors]
  );

  return (
    <div className="vh-root">
      {mode === 'units' && (
        <section className="vh-units">
          <h2>Visao hospitalar</h2>
          <p>Selecione a unidade para abrir o predio e navegar por andares.</p>
          {unitsLoading && <p>Carregando unidades...</p>}
          <div className="vh-unit-grid">
            {hospitals.map((hospital) => (
              <button
                key={hospital.id}
                className="vh-unit-card"
                onClick={() => {
                  setSelectedHospital(hospital.id);
                  setMode('building');
                  setSelectedFloorId('');
                }}
              >
                <div className="vh-unit-icon">🏥</div>
                <span>{hospital.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {mode !== 'units' && (
        <section className="vh-viewer">
          <header className="vh-topbar">
            <div>
              <h3>{currentHospitalLabel}</h3>
              <small>{mode === 'building' ? 'Clique em um andar para detalhes' : 'Detalhes do andar selecionado'}</small>
            </div>
            <div className="vh-actions">
              {mode === 'floor' && (
                <button onClick={() => setMode('building')} className="vh-btn-secondary">
                  Voltar ao predio
                </button>
              )}
              <button
                onClick={() => {
                  setMode('units');
                  setSelectedHospital('');
                  setSelectedFloorId('');
                  setCensoData(null);
                }}
                className="vh-btn-primary"
              >
                Voltar
              </button>
            </div>
          </header>

          {mode === 'building' && (
            <div className="vh-building-real-wrap">
              <div className="vh-building-layout">
                <HospitalBuilding3D
                  floors={buildingFloors3d}
                  unitName={currentHospitalLabel}
                  selectedFloorId={selectedFloorId}
                  onSelectFloor={(id) => {
                    setSelectedFloorId(id);
                    setMode('floor');
                  }}
                />
                <aside className="vh-outside-legend">
                  <h4>Andares</h4>
                  <div className="vh-outside-legend-list">
                    {buildingFloors3d.map((floor) => (
                      <button
                        key={floor.id}
                        className={`vh-legend-item is-${floor.band} ${selectedFloorId === floor.id ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedFloorId(floor.id);
                          setMode('floor');
                        }}
                      >
                        <span>{floor.label}</span>
                        <strong>{floor.pct}%</strong>
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            </div>
          )}

          {mode === 'floor' && selectedFloor && selectedFloor.kind === 'PS' && (
            <div className="vh-ps-detail">
              <div className="vh-floor-summary">
                <strong>{selectedFloor.label}</strong>
                <span>{psTotalActive} pessoas ativas no PS</span>
              </div>
              <div className="vh-stage-grid">
                {psStats.map((stage) => (
                  <article key={stage.key} className={`vh-stage-card vh-${pressureBand(stage.pct)}`}>
                    <h4>{stage.label}</h4>
                    <p>{stage.count} pessoas</p>
                    <strong>{stage.pct}%</strong>
                    <div className="vh-avatars">
                      {Array.from({ length: Math.min(8, Math.max(1, Math.ceil(stage.count / 3))) }).map((_, i) => (
                        <span key={`${stage.key}-${i}`} />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mode === 'floor' && selectedFloor && selectedFloor.kind !== 'PS' && (
            <div className="vh-bed-detail">
              <div className="vh-floor-summary">
                <strong>{selectedFloor.label}</strong>
                <span>
                  {selectedFloor.occupied}/{selectedFloor.total} ocupados ({selectedFloor.pct}%)
                </span>
              </div>

              <div className="vh-floor-sketch-wrap">
                <div className="vh-kpi-cloud">
                  <article className="vh-kpi-pill">
                    <span>Ocupacao</span>
                    <strong>{selectedFloor.pct}%</strong>
                  </article>
                  <article className="vh-kpi-pill">
                    <span>Leitos livres</span>
                    <strong>{Math.max(0, selectedFloor.total - selectedFloor.occupied)}</strong>
                  </article>
                  <article className="vh-kpi-pill">
                    <span>Pressao</span>
                    <strong>{floorPressureLabel(selectedFloor.pct)}</strong>
                  </article>
                </div>

                <div className="vh-floor-sketch" style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                  <HospitalFloorInterior3D 
                    sectors={
                      selectedFloor.sectors && selectedFloor.sectors.length > 0
                        ? selectedFloor.sectors
                        : [
                            {
                              name: 'Geral',
                              occupied: selectedFloor.occupied,
                              total: selectedFloor.total,
                              beds: selectedFloor.beds,
                            },
                          ]
                    } 
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

