import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { HospitalBuilding3D, type BuildingFloor3D } from './HospitalBuilding3D';
import { HospitalFloorInterior3D } from './HospitalFloorInterior3D';
import { PSFloorView3D } from './PSFloorView3D';

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
          <header className="vh-topbar" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '16px 24px', flexWrap: 'nowrap' }}>
            <div style={{ flexShrink: 0, minWidth: '200px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{currentHospitalLabel}</h3>
              <small style={{ color: '#6b8a9e' }}>{mode === 'building' ? 'Clique em um andar para detalhes' : 'Navegação de andares'}</small>
            </div>

            {/* Navegação rápida entre andares (Tabs -> Cards de Detalhe) */}
            {mode === 'floor' && (
              <div className="vh-floor-tabs" style={{ 
                flex: 1,
                display: 'flex', gap: '12px', padding: '4px', 
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                alignItems: 'center',
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none'  // IE/Edge
              }}>
                <style>{`.vh-floor-tabs::-webkit-scrollbar { display: none; }`}</style>
                {floors.map(f => {
                  const isSelected = selectedFloorId === f.id;
                  const band = pressureBand(f.pct);
                  const statusColor = band === 'high' ? '#ef4444' : band === 'mid' ? '#f59e0b' : '#10b981';
                  const statusBg = band === 'high' ? 'rgba(239, 68, 68, 0.15)' : band === 'mid' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
                  const titleParts = f.label.split(' - ');
                  const shortTitle = titleParts.length > 1 ? titleParts[0] : f.label;
                  
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFloorId(f.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '6px',
                        minWidth: '200px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid',
                        borderColor: isSelected ? '#35d3ff' : '#1e3a4a',
                        backgroundColor: isSelected ? 'rgba(10, 40, 60, 0.8)' : '#05121b',
                        color: isSelected ? '#ffffff' : '#9eb3c1',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 0 0 1px rgba(53, 211, 255, 0.3)' : '0 2px 4px rgba(0,0,0,0.2)',
                        textAlign: 'left',
                        flexShrink: 0
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                          {shortTitle}
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 'bold', 
                          padding: '2px 6px', 
                          borderRadius: '12px', 
                          backgroundColor: statusBg, 
                          color: statusColor,
                          border: `1px solid ${statusColor}40`,
                          boxShadow: `0 0 8px ${statusColor}20`
                        }}>
                          {f.pct}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '11px', color: isSelected ? '#aee6ff' : '#6b8a9e' }}>
                        <span>{f.kind === 'PS' ? 'Pronto Socorro' : f.kind === 'UTI_UPC' ? 'UTI/UPC' : 'Internação'}</span>
                        <span style={{ fontWeight: '600' }}>{f.kind === 'PS' ? `${f.occupied} ativos` : `${f.occupied}/${f.total}`}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="vh-actions" style={{ flexShrink: 0, display: 'flex', gap: '8px' }}>
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
                SAIR
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
            <div className="vh-ps-detail" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '560px', position: 'relative' }}>
              <div className="vh-floor-summary">
                <strong>{selectedFloor.label}</strong>
                <span>{psTotalActive} pessoas ativas no PS</span>
              </div>
              <PSFloorView3D
                floorName={selectedFloor.label}
                sectors={psStats.map((stage) => ({
                  name: stage.label,
                  occupied: stage.count,
                  total: Math.max(stage.count, 1),
                }))}
              />
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

                <div className="vh-floor-sketch" style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
                  {/* Detecta se é PS pela ausência de leitos ou pelo nome do andar */}
                  {(selectedFloor.beds.length === 0 && (!selectedFloor.sectors || selectedFloor.sectors.length === 0)) || 
                   String(selectedFloor.name ?? '').toLowerCase().includes('ps') || 
                   String(selectedFloor.name ?? '').toLowerCase().includes('pronto') ? (
                    <PSFloorView3D
                      key={selectedFloor.id}
                      floorName={selectedFloor.name}
                      sectors={
                        selectedFloor.sectors && selectedFloor.sectors.length > 0
                          ? selectedFloor.sectors.map(s => ({ name: s.name, occupied: s.occupied, total: s.total }))
                          : []
                      }
                    />
                  ) : (
                    <HospitalFloorInterior3D
                      key={selectedFloor.id}
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
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

