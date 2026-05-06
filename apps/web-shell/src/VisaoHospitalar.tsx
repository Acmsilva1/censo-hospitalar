import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { HospitalBuilding3D, type BuildingFloor3D } from './HospitalBuilding3D';
import { HospitalFloorInterior3D } from './HospitalFloorInterior3D';
import { PSFloorView3D } from './PSFloorView3D';
import { AnimatePresence, motion } from 'framer-motion';

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

function normalizeSectorName(name: string) {
  const n = name.toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  if (n.includes('UNIDADE PACIENTE CRITICO')) return 'UPC';
  if (n.includes('UNIDADE DE TERAPIA INTENSIVA')) return 'UTI';
  return name;
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
  if (t.includes('VV') || t.includes('VILA VELHA')) return 'ES_PS_VV';
  if (t.includes('VITORIA')) return 'ES_HOSPITAL_VITORIA';
  if (t.includes('BOTAFOGO')) return 'RJ_PS_BOTAFOGO';
  if (t.includes('CAMPO GRANDE')) return 'RJ_PS_CAMPO_GRANDE';
  if (t.includes('BARRA DA TIJUCA')) return 'RJ_PS_BARRA_DA_TIJUCA';
  if (t.includes('TAGUATINGA')) return 'DF_PS_TAGUATINGA';
  if (t.includes('SIG')) return 'DF_PS_SIG';
  if (t.includes('GUTIERREZ')) return 'MG_GUTIERREZ';
  if (t.includes('PAMPULHA')) return 'MG_PAMPULHA';
  return t;
}

type UnitCardTheme = {
  background: string;
  accent: string;
};

const UNIT_CARD_THEME: Record<string, UnitCardTheme> = {
  DF_PS_SIG: {
    background: 'linear-gradient(160deg, #16a34a 0%, #15803d 45%, #14532d 100%)',
    accent: '#4ade80',
  },
  DF_PS_TAGUATINGA: {
    background: 'linear-gradient(160deg, #0f766e 0%, #0e7490 48%, #155e75 100%)',
    accent: '#5eead4',
  },
  ES_HOSPITAL_VITORIA: {
    background: 'linear-gradient(160deg, #0ea5e9 0%, #0284c7 45%, #075985 100%)',
    accent: '#7dd3fc',
  },
  ES_PS_VV: {
    background: 'linear-gradient(160deg, #2563eb 0%, #1d4ed8 48%, #1e3a8a 100%)',
    accent: '#93c5fd',
  },
  MG_GUTIERREZ: {
    background: 'linear-gradient(160deg, #7e22ce 0%, #9333ea 50%, #581c87 100%)',
    accent: '#d8b4fe',
  },
  MG_PAMPULHA: {
    background: 'linear-gradient(160deg, #be185d 0%, #a21caf 50%, #701a75 100%)',
    accent: '#f9a8d4',
  },
  RJ_PS_BARRA_DA_TIJUCA: {
    background: 'linear-gradient(160deg, #ea580c 0%, #c2410c 48%, #7c2d12 100%)',
    accent: '#fdba74',
  },
  RJ_PS_BOTAFOGO: {
    background: 'linear-gradient(160deg, #1d4ed8 0%, #1e40af 45%, #172554 100%)',
    accent: '#bfdbfe',
  },
  RJ_PS_CAMPO_GRANDE: {
    background: 'linear-gradient(160deg, #dc2626 0%, #b91c1c 50%, #7f1d1d 100%)',
    accent: '#fca5a5',
  },
};

function unitCardTheme(hospitalId: string): UnitCardTheme {
  const key = canonicalUnitKey(hospitalId);
  return UNIT_CARD_THEME[key] || {
    background: 'linear-gradient(160deg, #0a3652 0%, #08283f 52%, #061e31 100%)',
    accent: '#8fdfff',
  };
}

/** Título mais limpo no card (sem “UF -” inicial nem sufixo “- PS”; remove prefixo “MG BH ”). */
function formatUnitCardTitle(label: string): string {
  let s = label.trim();
  s = s.replace(/^[A-Z]{2}\s*-\s*/i, '');
  s = s.replace(/\s*-\s*PS\s*$/i, '');
  s = s.replace(/^MG\s+BH\s+/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s || label.trim();
}

const vhUnitListVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.06 },
  },
} as const;

const vhUnitItemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
} as const;

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
        sectors.push({ name: normalizeSectorName(sectorName), occupied, total: beds.length, beds });
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
      <AnimatePresence mode="wait">
        {mode === 'units' && (
          <motion.div
            key="units"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 18 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: '100%', height: '100%', overflow: 'auto' }}
          >
            <section className="vh-units" style={{ padding: '24px 18px 32px' }}>
              <h2>Unidades</h2>
              <p>Escolha uma unidade para abrir a visão do prédio</p>
              {unitsLoading ? (
                <p style={{ color: '#bcd4e8' }}>Carregando unidades…</p>
              ) : (
                <motion.div
                  className="vh-unit-grid"
                  style={{ margin: '20px auto 0' }}
                  variants={vhUnitListVariants}
                  initial="hidden"
                  animate="show"
                >
                  {hospitals.map((u, index) => {
                    const theme = unitCardTheme(u.id);
                    return (
                      <motion.button
                        key={u.id}
                        type="button"
                        className="vh-unit-card"
                        variants={vhUnitItemVariants}
                        onClick={() => {
                          setSelectedHospital(u.id);
                          setMode('building');
                          setSelectedFloorId('');
                        }}
                      >
                      <div
                        className="vh-unit-visual-wrap"
                        style={{
                          background: theme.background,
                          animationDelay: `${index * 0.18}s`,
                          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.42), 0 14px 32px rgba(0, 0, 0, 0.38), 0 0 0 1px ${theme.accent}66, 0 0 22px ${theme.accent}44`,
                        }}
                        aria-hidden
                      >
                        <img
                          className="vh-mini-hospital-3d"
                          src="/predio-unidade-3d.png"
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                        <div className="vh-unit-photo-glass" />
                      </div>
                      <span className="vh-unit-card-title">{formatUnitCardTitle(u.label)}</span>
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </section>
          </motion.div>
        )}

        {mode !== 'units' && (
          <motion.div
            key="viewer"
            initial={{ opacity: 0, x: 22 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -22 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: '100%', height: '100%' }}
          >
            <section className="vh-viewer">
              <header className="vh-topbar" style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '16px 24px', flexWrap: 'nowrap' }}>
                <div style={{ flexShrink: 0, minWidth: '200px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{currentHospitalLabel}</h3>
                  <small style={{ color: '#6b8a9e' }}>{mode === 'building' ? 'Clique em um andar para detalhes' : 'Navegação de andares'}</small>
                </div>

                {mode === 'floor' && (
                  <div className="vh-floor-tabs" style={{ 
                    flex: 1,
                    display: 'flex', gap: '12px', padding: '4px', 
                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                    alignItems: 'center',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
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

              <AnimatePresence mode="wait">
                {mode === 'building' && (
                  <motion.div
                    key="building-view"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className="vh-building-real-wrap"
                  >
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
                              type="button"
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
                  </motion.div>
                )}

                {mode === 'floor' && (
                  <motion.div
                    key={`floor-view-${selectedFloorId}`}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.3 }}
                    style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
                  >
                    {selectedFloor && selectedFloor.kind === 'PS' ? (
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
                    ) : selectedFloor ? (
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
                            {(selectedFloor.beds.length === 0 && (!selectedFloor.sectors || selectedFloor.sectors.length === 0)) || 
                             String(selectedFloor.label ?? '').toLowerCase().includes('ps') || 
                             String(selectedFloor.label ?? '').toLowerCase().includes('pronto') ? (
                              <PSFloorView3D
                                key={selectedFloor.id}
                                floorName={selectedFloor.label}
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
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


