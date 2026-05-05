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

/** Matiz base por UF — todas as unidades do mesmo estado ficam na mesma família de cor (nenhum “só amarelo”). */
const UF_HUE: Record<string, number> = {
  ES: 188,
  RJ: 218,
  DF: 154,
  MG: 278,
  SP: 200,
  GO: 38,
  BA: 24,
  PR: 152,
};

function hueDriftFromKey(key: string): number {
  let n = 0;
  for (let i = 0; i < key.length; i++) n += key.charCodeAt(i);
  return (n % 22) - 11;
}

function extractUfFromLabel(label: string): string {
  const byDash = label.match(/^\s*([A-Z]{2})\s*-/i);
  if (byDash?.[1]) return byDash[1].toUpperCase();
  const bySpace = label.match(/^\s*([A-Z]{2})\s+[A-Za-z]/i);
  if (bySpace?.[1]) return bySpace[1].toUpperCase();
  return 'BR';
}

/** Gradiente HSL coerente: UF + pequeno desvio por `canonicalUnitKey` (ex.: Gutierrez vs Pampulha). */
function unitCardGradient(hospitalId: string): string {
  const label = displayUnitName(hospitalId);
  const uf = extractUfFromLabel(label);
  const base = UF_HUE[uf] ?? 206;
  const drift = hueDriftFromKey(canonicalUnitKey(hospitalId));
  const h1 = (base + drift + 360) % 360;
  const h2 = (h1 + 16 + (drift % 5)) % 360;
  return `linear-gradient(152deg, hsl(${h1} 76% 56%) 0%, hsl(${h2} 74% 38%) 48%, hsl(${h2} 68% 22%) 100%)`;
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

function MiniHospital3D({ hospitalId, index }: { hospitalId: string; index: number }) {
  const key = canonicalUnitKey(hospitalId);
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed += key.charCodeAt(i);
  seed += index * 31;
  const bodyHue = (190 + (seed % 70)) % 360;
  const sideHue = (bodyHue + 8) % 360;
  const roofHue = (bodyHue - 12 + 360) % 360;
  const winGlow = seed % 2 === 0 ? '#bff7ff' : '#d6f8ff';
  return (
    <svg viewBox="0 0 240 140" className="vh-mini-hospital-3d" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`vhRoof_${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${roofHue} 58% 62%)`} />
          <stop offset="100%" stopColor={`hsl(${roofHue} 62% 38%)`} />
        </linearGradient>
        <linearGradient id={`vhFront_${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${bodyHue} 58% 66%)`} />
          <stop offset="100%" stopColor={`hsl(${bodyHue} 55% 42%)`} />
        </linearGradient>
        <linearGradient id={`vhSide_${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${sideHue} 52% 52%)`} />
          <stop offset="100%" stopColor={`hsl(${sideHue} 50% 34%)`} />
        </linearGradient>
        <linearGradient id={`vhBase_${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${sideHue} 34% 28%)`} />
          <stop offset="100%" stopColor={`hsl(${sideHue} 36% 16%)`} />
        </linearGradient>
      </defs>
      <ellipse cx="124" cy="124" rx="86" ry="10.5" fill="rgba(5,14,25,0.38)" />
      <polygon points="72,44 144,20 196,42 124,66" fill={`url(#vhRoof_${seed})`} />
      <polygon points="72,44 124,66 124,108 72,86" fill={`url(#vhSide_${seed})`} />
      <polygon points="124,66 196,42 196,86 124,108" fill={`url(#vhFront_${seed})`} />
      <polygon points="66,87 124,108 124,114 66,94" fill={`url(#vhBase_${seed})`} />
      <polygon points="124,108 204,84 204,90 124,114" fill={`url(#vhBase_${seed})`} />
      <polygon points="108,49 126,43 140,49 122,56" fill="rgba(255,255,255,0.6)" />
      <polygon points="122,56 140,49 140,66 122,72" fill="rgba(255,255,255,0.42)" />
      <polygon points="108,49 122,56 122,72 108,65" fill="rgba(255,255,255,0.3)" />
      <rect x="118.5" y="47.5" width="7" height="18" rx="1.4" fill="rgba(255,255,255,0.7)" />
      <rect x="113" y="53.5" width="18" height="6" rx="1.4" fill="rgba(255,255,255,0.7)" />
      {Array.from({ length: 3 }).map((_, r) =>
        Array.from({ length: 4 }).map((__, c) => {
          const x = 132 + c * 14;
          const y = 70 + r * 11;
          return <rect key={`f-${r}-${c}`} x={x} y={y} width="8.5" height="7" rx="1.2" fill={winGlow} opacity="0.82" />;
        })
      )}
      {Array.from({ length: 2 }).map((_, r) =>
        Array.from({ length: 2 }).map((__, c) => {
          const x = 86 + c * 14;
          const y = 72 + r * 11;
          return <rect key={`s-${r}-${c}`} x={x} y={y} width="7.5" height="6.6" rx="1.2" fill={winGlow} opacity="0.65" />;
        })
      )}
      <polygon points="154,108 170,103 170,84 154,89" fill="rgba(14,24,40,0.6)" />
      <polygon points="154,89 170,84 179,89 163,94" fill="rgba(255,255,255,0.2)" />
      <path d="M124 66L196 42" stroke="rgba(255,255,255,0.2)" strokeWidth="1.1" />
      <path d="M72 44L124 66" stroke="rgba(255,255,255,0.16)" strokeWidth="1.1" />
    </svg>
  );
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
                  {hospitals.map((u, index) => (
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
                          background: unitCardGradient(u.id),
                          animationDelay: `${index * 0.18}s`,
                        }}
                        aria-hidden
                      >
                        <MiniHospital3D hospitalId={u.id} index={index} />
                        <div className="vh-unit-photo-glass" />
                      </div>
                      <span className="vh-unit-card-title">{formatUnitCardTitle(u.label)}</span>
                    </motion.button>
                  ))}
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


