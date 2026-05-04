import { useEffect, useMemo, useRef, useState } from 'react';
import { geoCentroid, geoContains, geoMercator, geoPath } from 'd3-geo';

type UnitOption = { id: string; label: string };

type BrazilUnitsMapProps = {
  hospitals: UnitOption[];
  unitsLoading: boolean;
  onSelectUnit: (unitId: string) => void;
  /** Painel estreito ao lado do prédio — viewport e shell mais compactos */
  layout?: 'full' | 'rail';
  /** Destaca o pino da unidade atualmente aberta no viewer */
  selectedUnitId?: string;
};

type GeoFeature = {
  type: 'Feature';
  geometry: any;
  properties?: {
    sigla?: string;
    name?: string;
  };
};

type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

type UnitPinBase = {
  uf: string;
  lat: number;
  lng: number;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 1060;
const MAP_FILL_SCALE = 1.22;

const UNIT_PIN_BASE: Record<string, UnitPinBase> = {
  ES_HOSPITAL_VITORIA: { uf: 'ES', lat: -20.3155, lng: -40.3128 },
  ES_PS_VV: { uf: 'ES', lat: -20.3478, lng: -40.2949 },
  RJ_PS_BARRA_DA_TIJUCA: { uf: 'RJ', lat: -23.0004, lng: -43.3659 },
  RJ_PS_BOTAFOGO: { uf: 'RJ', lat: -22.9519, lng: -43.1822 },
  RJ_PS_CAMPO_GRANDE: { uf: 'RJ', lat: -22.9056, lng: -43.5652 },
  DF_PS_SIG: { uf: 'DF', lat: -15.801, lng: -47.909 },
  DF_PS_TAGUATINGA: { uf: 'DF', lat: -15.833, lng: -48.05 },
  MG_GUTIERREZ: { uf: 'MG', lat: -19.938, lng: -43.95 },
  MG_PAMPULHA: { uf: 'MG', lat: -19.851, lng: -43.967 },
};

const UNIT_PIN_NUDGE: Record<string, [number, number]> = {
  ES_HOSPITAL_VITORIA: [0, -18],
  ES_PS_VV: [0, 18],
  MG_GUTIERREZ: [-24, -8],
  MG_PAMPULHA: [24, 8],
  RJ_PS_BOTAFOGO: [-24, -6],
  RJ_PS_BARRA_DA_TIJUCA: [-34, 8],
  RJ_PS_CAMPO_GRANDE: [-14, 18],
};

const OFFSET_RING = [
  [0, 0],
  [16, -12],
  [-16, -10],
  [14, 12],
  [-14, 12],
  [26, 0],
  [-26, 0],
  [0, -22],
  [0, 22],
];
const MARKER_SCALE = 1.02;
const MIN_MARKER_GAP = 16;
const RJ_MIN_MARKER_GAP = 30;
const LOCKED_LAYOUT_UFS = new Set(['DF', 'ES', 'MG', 'RJ']);
const LOCKED_STATE_SLOTS: Record<string, Array<[number, number]>> = {
  DF: [
    [-16, -10], // SIG (2x à esquerda + 2x acima)
    [8, -2],    // TAGUATINGA (2x acima)
  ],
  // offsets relativos ao centróide do estado (x, y)
  ES: [
    [0, -22],
    [0, 14],
    [-10, 2],
  ],
  RJ: [
    [-2, -20],  // em cima (3x à direita)
    [24, -18],  // no meio (2x mais à direita e um pouco acima)
    [-22, 8],   // embaixo (2x acima + 2x à esquerda)
    [-4, 8],    // fallback para unidade extra
  ],
};

function distance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

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

function canonicalUnitKey(raw: string) {
  const t = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (t.includes('VILA VELHA') || t.includes('PS VV') || t.includes(' ES VV')) return 'ES_PS_VV';
  if (t.includes('HOSPITAL VITORIA') || t.includes('PS VITORIA') || t.includes(' ES VITORIA')) return 'ES_HOSPITAL_VITORIA';
  if (t.includes('BOTAFOGO')) return 'RJ_PS_BOTAFOGO';
  if (t.includes('CAMPO GRANDE')) return 'RJ_PS_CAMPO_GRANDE';
  if (t.includes('BARRA DA TIJUCA')) return 'RJ_PS_BARRA_DA_TIJUCA';
  if (t.includes('TAGUATINGA')) return 'DF_PS_TAGUATINGA';
  if (t.includes(' SIG') || t.startsWith('SIG ') || t.includes(' PS SIG')) return 'DF_PS_SIG';
  if (t.includes('GUTIERREZ')) return 'MG_GUTIERREZ';
  if (t.includes('PAMPULHA')) return 'MG_PAMPULHA';
  return t;
}

function extractUf(raw: string) {
  const match = raw.toUpperCase().match(/^\s*([A-Z]{2})\s*[- ]/);
  return match?.[1] || '';
}

function stateColorByCount(count: number) {
  return count > 0 ? '#eab308' : '#0f3a2a';
}

const STATE_GLASS_COLORS: Record<string, string> = {
  DF: '#facc15',
  ES: '#22d3ee',
  RJ: '#fb7185',
  MG: '#a78bfa',
  SP: '#34d399',
  GO: '#f59e0b',
  BA: '#60a5fa',
  PR: '#4ade80',
  SC: '#38bdf8',
  RS: '#f472b6',
  MT: '#84cc16',
  MS: '#2dd4bf',
  TO: '#f97316',
  PA: '#10b981',
  AM: '#06b6d4',
};

function stateGlassColor(uf: string) {
  return STATE_GLASS_COLORS[uf] || '#fde047';
}

type TooltipTheme = {
  bgA: string;
  bgB: string;
  border: string;
  buttonA: string;
  buttonB: string;
  buttonText: string;
};

const TOOLTIP_THEME_BY_UNIT_KEY: Record<string, TooltipTheme> = {
  ES_HOSPITAL_VITORIA: { bgA: '#3b0a45', bgB: '#5b0f6a', border: '#e879f9', buttonA: '#f0abfc', buttonB: '#e879f9', buttonText: '#3b0764' },
  ES_PS_VV: { bgA: '#1f2937', bgB: '#0f766e', border: '#5eead4', buttonA: '#99f6e4', buttonB: '#5eead4', buttonText: '#134e4a' },
  RJ_PS_BARRA_DA_TIJUCA: { bgA: '#3f1d00', bgB: '#7c2d12', border: '#fdba74', buttonA: '#fed7aa', buttonB: '#fb923c', buttonText: '#7c2d12' },
  RJ_PS_BOTAFOGO: { bgA: '#172554', bgB: '#1d4ed8', border: '#93c5fd', buttonA: '#bfdbfe', buttonB: '#60a5fa', buttonText: '#1e3a8a' },
  RJ_PS_CAMPO_GRANDE: { bgA: '#3f0d2e', bgB: '#831843', border: '#f9a8d4', buttonA: '#fbcfe8', buttonB: '#f472b6', buttonText: '#831843' },
  DF_PS_SIG: { bgA: '#052e16', bgB: '#166534', border: '#86efac', buttonA: '#bbf7d0', buttonB: '#4ade80', buttonText: '#14532d' },
  DF_PS_TAGUATINGA: { bgA: '#3b0764', bgB: '#6d28d9', border: '#c4b5fd', buttonA: '#ddd6fe', buttonB: '#a78bfa', buttonText: '#4c1d95' },
  MG_GUTIERREZ: { bgA: '#422006', bgB: '#92400e', border: '#fcd34d', buttonA: '#fde68a', buttonB: '#f59e0b', buttonText: '#78350f' },
  MG_PAMPULHA: { bgA: '#082f49', bgB: '#0e7490', border: '#67e8f9', buttonA: '#a5f3fc', buttonB: '#22d3ee', buttonText: '#164e63' },
};

const MARKER_COLOR_BY_UNIT_KEY: Record<string, string> = {
  ES_HOSPITAL_VITORIA: '#e879f9',
  ES_PS_VV: '#14b8a6',
  RJ_PS_BARRA_DA_TIJUCA: '#f97316',
  RJ_PS_BOTAFOGO: '#3b82f6',
  RJ_PS_CAMPO_GRANDE: '#ec4899',
  DF_PS_SIG: '#22c55e',
  DF_PS_TAGUATINGA: '#8b5cf6',
  MG_GUTIERREZ: '#f59e0b',
  MG_PAMPULHA: '#06b6d4',
};

function tooltipThemeForUnitKey(key: string): TooltipTheme {
  return TOOLTIP_THEME_BY_UNIT_KEY[key] || {
    bgA: '#1f2937',
    bgB: '#0f172a',
    border: '#cbd5e1',
    buttonA: '#e2e8f0',
    buttonB: '#cbd5e1',
    buttonText: '#0f172a',
  };
}

function markerColorForUnitKey(key: string): string {
  return MARKER_COLOR_BY_UNIT_KEY[key] || '#ef4444';
}

function nearestPointInsideState(
  projection: ReturnType<typeof geoMercator>,
  stateFeature: GeoFeature | undefined,
  preferred: [number, number]
): [number, number] {
  if (!stateFeature) return preferred;
  const ll0 = projection.invert?.(preferred);
  if (ll0 && geoContains(stateFeature as any, ll0 as [number, number])) return preferred;

  let best = preferred;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let r = 4; r <= 44; r += 4) {
    for (let a = 0; a < 360; a += 20) {
      const rad = (a * Math.PI) / 180;
      const candidate: [number, number] = [preferred[0] + Math.cos(rad) * r, preferred[1] + Math.sin(rad) * r];
      const ll = projection.invert?.(candidate);
      if (!ll || !geoContains(stateFeature as any, ll as [number, number])) continue;
      const d = Math.hypot(candidate[0] - preferred[0], candidate[1] - preferred[1]);
      if (d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    }
    if (bestDist < Number.POSITIVE_INFINITY) break;
  }
  return best;
}

/** Posição do tooltip em % do viewport, mantendo caixa dentro do mapa (coords SVG 0…MAP) */
function tooltipPercentsForPin(
  pinX: number,
  pinY: number,
  dx: number,
  dy: number,
  layout: 'full' | 'rail'
): { left: string; top: string } {
  const reserveX = layout === 'rail' ? 0.3 * MAP_WIDTH : 0.24 * MAP_WIDTH;
  const ax = pinX + dx;
  const ay = pinY + dy;

  let leftSvg = ax + 8;
  if (leftSvg + reserveX > MAP_WIDTH - 14) {
    leftSvg = ax - reserveX - 8;
  }
  leftSvg = Math.min(MAP_WIDTH - reserveX - 16, Math.max(10, leftSvg));

  let topSvg = ay - 42;
  topSvg = Math.min(MAP_HEIGHT - 118, Math.max(8, topSvg));

  return {
    left: `${(leftSvg / MAP_WIDTH) * 100}%`,
    top: `${(topSvg / MAP_HEIGHT) * 100}%`,
  };
}

export function BrazilUnitsMap({
  hospitals,
  unitsLoading,
  onSelectUnit,
  layout = 'full',
  selectedUnitId = '',
}: BrazilUnitsMapProps) {
  const [geoData, setGeoData] = useState<GeoFeatureCollection | null>(null);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);
  const clearHoverTimerRef = useRef<number | null>(null);

  const cancelClearHover = () => {
    if (clearHoverTimerRef.current !== null) {
      window.clearTimeout(clearHoverTimerRef.current);
      clearHoverTimerRef.current = null;
    }
  };

  const scheduleClearHover = () => {
    cancelClearHover();
    clearHoverTimerRef.current = window.setTimeout(() => {
      setHoveredUf(null);
      setActiveUnitId(null);
      clearHoverTimerRef.current = null;
    }, 120);
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/geo/br-states.json')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setGeoData(json as GeoFeatureCollection);
      })
      .catch(() => {
        if (!cancelled) setGeoData({ type: 'FeatureCollection', features: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => {
    cancelClearHover();
  }, []);

  const projection = useMemo(() => {
    if (!geoData) return null;
    const p = geoMercator().fitExtent(
      [[4, 2], [MAP_WIDTH - 4, MAP_HEIGHT - 2]],
      geoData as any
    );
    p.scale(p.scale() * MAP_FILL_SCALE);
    return p;
  }, [geoData]);

  const pathGen = useMemo(() => {
    if (!projection) return null;
    return geoPath(projection);
  }, [projection]);

  const mapCenterOffset = useMemo(() => {
    if (!geoData || !pathGen) return { dx: 0, dy: 0 };
    const bounds = pathGen.bounds(geoData as any);
    const minX = bounds[0][0];
    const minY = bounds[0][1];
    const maxX = bounds[1][0];
    const maxY = bounds[1][1];
    const mapCx = (minX + maxX) / 2;
    const mapCy = (minY + maxY) / 2;
    return {
      dx: MAP_WIDTH / 2 - mapCx,
      dy: MAP_HEIGHT / 2 - mapCy - 8,
    };
  }, [geoData, pathGen]);

  const stateCentroids = useMemo(() => {
    const map = new Map<string, [number, number]>();
    if (!geoData || !projection) return map;
    for (const feature of geoData.features) {
      const uf = feature.properties?.sigla || '';
      if (!uf) continue;
      const [lng, lat] = geoCentroid(feature as any);
      const point = projection([lng, lat]);
      if (point) map.set(uf, [point[0], point[1]]);
    }
    return map;
  }, [geoData, projection]);

  const stateFeatureByUf = useMemo(() => {
    const map = new Map<string, GeoFeature>();
    for (const feature of geoData?.features || []) {
      const uf = feature.properties?.sigla || '';
      if (uf) map.set(uf, feature);
    }
    return map;
  }, [geoData]);

  const unitPins = useMemo(() => {
    if (!projection) return [] as Array<{ id: string; label: string; uf: string; x: number; y: number; key: string }>;

    const prePins = hospitals.map((unit) => {
      const key = canonicalUnitKey(unit.id || unit.label);
      const known = UNIT_PIN_BASE[key];
      const uf = known?.uf || extractUf(unit.label) || extractUf(unit.id);

      if (known) {
        const point = projection([known.lng, known.lat]);
        if (point) {
          const nudge = UNIT_PIN_NUDGE[key] || [0, 0];
          return { ...unit, key, uf, x: point[0] + nudge[0], y: point[1] + nudge[1] };
        }
      }

      const centroid = stateCentroids.get(uf) || [MAP_WIDTH / 2, MAP_HEIGHT / 2];
      return { ...unit, key, uf, x: centroid[0], y: centroid[1] };
    });

    const byUf = new Map<string, typeof prePins>();
    for (const pin of prePins) {
      const list = byUf.get(pin.uf) || [];
      list.push(pin);
      byUf.set(pin.uf, list);
    }

    const resolved: Array<{ id: string; label: string; uf: string; x: number; y: number; key: string }> = [];

    for (const pins of byUf.values()) {
      pins.sort((a, b) => a.key.localeCompare(b.key));
      const uf = pins[0]?.uf || '';
      if (LOCKED_LAYOUT_UFS.has(uf)) {
        const centroid = stateCentroids.get(uf);
        const slots = LOCKED_STATE_SLOTS[uf] || [];
        const lockedStateFeature = stateFeatureByUf.get(uf);
        pins.forEach((pin, idx) => {
          if (!centroid || !slots.length) {
            resolved.push({ ...pin, x: pin.x, y: pin.y });
            return;
          }
          const slot = slots[idx % slots.length];
          const preferred: [number, number] = [centroid[0] + slot[0], centroid[1] + slot[1]];
          const inside = nearestPointInsideState(projection, lockedStateFeature, preferred);
          resolved.push({
            ...pin,
            x: inside[0],
            y: inside[1],
          });
        });
        continue;
      }
      const stateFeature = stateFeatureByUf.get(uf);
      const stateBounds = stateFeature && pathGen ? pathGen.bounds(stateFeature as any) : null;
      const stateW = stateBounds ? Math.max(1, stateBounds[1][0] - stateBounds[0][0]) : 120;
      const stateH = stateBounds ? Math.max(1, stateBounds[1][1] - stateBounds[0][1]) : 120;
      const stateExtent = Math.min(stateW, stateH);
      const isRJ = uf === 'RJ';
      const stateCentroid = stateCentroids.get(uf);
      const localMinGap = isRJ ? RJ_MIN_MARKER_GAP : MIN_MARKER_GAP;
      const localMaxRadius = isRJ ? Math.min(52, Math.max(24, stateExtent * 0.34)) : 32;
      const localCandidates: Array<[number, number]> = [[0, 0]];
      for (let r = 12; r <= localMaxRadius; r += isRJ ? 6 : 10) {
        for (let a = 0; a < 360; a += isRJ ? 30 : 45) {
          const rad = (a * Math.PI) / 180;
          localCandidates.push([Math.cos(rad) * r, Math.sin(rad) * r]);
        }
      }
      const placed: Array<[number, number]> = [];

      pins.forEach((pin, idx) => {
        if (pins.length === 1) {
          resolved.push({ ...pin, x: pin.x, y: pin.y });
          return;
        }
        const fallback = OFFSET_RING[idx] || [((idx % 2 === 0 ? 1 : -1) * (12 + idx * 3)), ((idx % 3) - 1) * 12];
        let chosen: [number, number] = [pin.x + fallback[0], pin.y + fallback[1]];
        let bestScore = Number.POSITIVE_INFINITY;

        for (const [ox, oy] of localCandidates) {
          const candidate: [number, number] = [pin.x + ox, pin.y + oy];
          let insideState = true;
          if (stateFeature) {
            const ll = projection.invert?.(candidate);
            insideState = !!ll && geoContains(stateFeature as any, ll as [number, number]);
          }
          if (!insideState) continue;

          const nearest = placed.length
            ? Math.min(...placed.map((p) => distance(p, candidate)))
            : Number.POSITIVE_INFINITY;
          const gapPenalty = nearest >= localMinGap ? 0 : (localMinGap - nearest) * 10;
          const centerPenalty = Math.hypot(ox, oy) * 0.45;
          let coastPenalty = 0;
          if (isRJ && stateCentroid) {
            const coastLimitX = stateCentroid[0] + stateW * 0.12;
            if (candidate[0] > coastLimitX) {
              coastPenalty += (candidate[0] - coastLimitX) * 8;
            }
          }
          const score = gapPenalty + centerPenalty + coastPenalty;
          if (score < bestScore) {
            bestScore = score;
            chosen = candidate;
          }
        }

        placed.push(chosen);
        resolved.push({ ...pin, x: chosen[0], y: chosen[1] });
      });
    }

    return resolved;
  }, [hospitals, projection, stateCentroids, stateFeatureByUf]);

  const unitCountByUf = useMemo(() => {
    const map = new Map<string, number>();
    for (const pin of unitPins) {
      map.set(pin.uf, (map.get(pin.uf) || 0) + 1);
    }
    return map;
  }, [unitPins]);

  const activePin = useMemo(
    () => unitPins.find((u) => u.id === activeUnitId) || null,
    [activeUnitId, unitPins]
  );

  const selectedPin = useMemo(
    () => (selectedUnitId ? unitPins.find((u) => u.id === selectedUnitId) || null : null),
    [selectedUnitId, unitPins]
  );

  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ key: string; label: string; color: string }> = [];
    for (const pin of unitPins) {
      if (seen.has(pin.key)) continue;
      seen.add(pin.key);
      items.push({
        key: pin.key,
        label: pin.label,
        color: markerColorForUnitKey(pin.key),
      });
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }, [unitPins]);

  const labelByUf = useMemo(() => {
    const byUf = new Map<string, { uf: string; x: number; y: number }>();
    for (const feature of geoData?.features || []) {
      const uf = feature.properties?.sigla || '';
      if (!uf) continue;
      const c = stateCentroids.get(uf);
      if (!c) continue;
      byUf.set(uf, { uf, x: c[0], y: c[1] });
    }

    const labels = Array.from(byUf.values());
    for (const label of labels) {
      const nearPins = unitPins.filter((pin) => pin.uf === label.uf);
      if (!nearPins.length) continue;
      const closest = nearPins.reduce((acc, pin) => {
        const d = Math.hypot(pin.x - label.x, pin.y - label.y);
        return d < acc.dist ? { dist: d, pin } : acc;
      }, { dist: Number.POSITIVE_INFINITY, pin: nearPins[0] });
      if (closest.dist < 32) {
        label.y -= 26;
      }
      if (label.uf === 'RJ') {
        label.x += 8;
        label.y += 36;
      }
      if (label.uf === 'ES') {
        label.x += 18;
        label.y += 16;
      }
    }
    return labels;
  }, [geoData?.features, stateCentroids, unitPins]);

  return (
    <section className={`vh-units vh-map-section${layout === 'rail' ? ' vh-map-layout-rail' : ''}`}>
      {unitsLoading && <p>Carregando unidades...</p>}

      <div className="vh-map-shell">
        <div className="vh-map-3d-plane" />
        <div className="vh-map-viewport">
          <svg
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            className="vh-map-svg"
            role="img"
            aria-label="Mapa do Brasil com unidades"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="vh-map-shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#031913" floodOpacity="0.55" />
              </filter>
              <filter id="vh-map-glow" x="-40%" y="-40%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#86efac" floodOpacity="0.52" />
              </filter>
              <linearGradient id="vh-state-glass-highlight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff90" />
                <stop offset="38%" stopColor="#ffffff2f" />
                <stop offset="100%" stopColor="#ffffff00" />
              </linearGradient>
            </defs>

            <g transform={`translate(${mapCenterOffset.dx}, ${mapCenterOffset.dy})`}>
              {geoData?.features.map((feature, idx) => {
                if (!pathGen) return null;
                const d = pathGen(feature as any);
                if (!d) return null;
                const uf = feature.properties?.sigla || '';
                const count = unitCountByUf.get(uf) || 0;
                const isHot =
                  hoveredUf === uf ||
                  (activePin && activePin.uf === uf) ||
                  (selectedPin && selectedPin.uf === uf);
                const hasUnits = count > 0;

                return (
                  <g key={`${uf}_${idx}`} className="vh-map-state-group">
                    <path d={d} className="vh-map-state-extrude" />
                    <path
                      d={d}
                      className={`vh-map-state ${hasUnits ? 'has-units' : ''} ${isHot ? 'is-hot' : ''}`}
                      style={{ fill: hasUnits ? stateGlassColor(uf) : stateColorByCount(count) }}
                      filter={isHot ? 'url(#vh-map-glow)' : undefined}
                    />
                    {hasUnits && <path d={d} className="vh-map-state-glass-highlight" />}
                  </g>
                );
              })}

              {(unitCountByUf.get('DF') || 0) > 0 && stateCentroids.get('DF') && (
                <g className="vh-df-emphasis">
                  <circle
                    cx={stateCentroids.get('DF')![0]}
                    cy={stateCentroids.get('DF')![1]}
                    r="8.5"
                    className="vh-df-emphasis-ring"
                  />
                  <circle
                    cx={stateCentroids.get('DF')![0]}
                    cy={stateCentroids.get('DF')![1]}
                    r="4.2"
                    className="vh-df-emphasis-core"
                  />
                </g>
              )}

              {geoData?.features.map((feature, idx) => {
                if (!pathGen) return null;
                const d = pathGen(feature as any);
                if (!d) return null;
                const uf = feature.properties?.sigla || '';
                return <path key={`border_${uf}_${idx}`} d={d} className="vh-map-boundary" />;
              })}

              {unitPins.map((pin) => {
                const isActive = activePin?.id === pin.id || pin.id === selectedUnitId;
                const baseScale = MARKER_SCALE;
                return (
                  <g
                    key={pin.id}
                    transform={`translate(${pin.x}, ${pin.y}) scale(${baseScale})`}
                    className={`vh-marker ${isActive ? 'is-active' : ''}`}
                    onPointerEnter={() => {
                      cancelClearHover();
                      setActiveUnitId(pin.id);
                      setHoveredUf(pin.uf);
                    }}
                    onPointerLeave={() => {
                      scheduleClearHover();
                    }}
                    onClick={() => onSelectUnit(pin.id)}
                  >
                    <circle className="vh-marker-hit" r="16" />
                    <circle className="vh-marker-halo" r="11" />
                    <path
                      className="vh-marker-pin"
                      style={{ fill: markerColorForUnitKey(pin.key) }}
                      d="M0 -13C-5.2 -13 -9.2 -8.9 -9.2 -3.9C-9.2 3.2 -2.7 7.9 0 13C2.7 7.9 9.2 3.2 9.2 -3.9C9.2 -8.9 5.2 -13 0 -13Z"
                    />
                    <circle className="vh-marker-dot" r="3.3" cy="-4.7" />
                  </g>
                );
              })}

              {labelByUf.map((label) => (
                <text
                  key={`label_${label.uf}`}
                  x={label.x}
                  y={label.y}
                  className="vh-state-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {label.uf}
                </text>
              ))}
            </g>
          </svg>

          {activePin && (
            (() => {
              const theme = tooltipThemeForUnitKey(activePin.key);
              const pos = tooltipPercentsForPin(
                activePin.x,
                activePin.y,
                mapCenterOffset.dx,
                mapCenterOffset.dy,
                layout
              );
              return (
            <div
              className={`vh-tooltip-3d${layout === 'rail' ? ' vh-tooltip-3d--rail' : ''}`}
              style={{
                left: pos.left,
                top: pos.top,
                ['--vh-tooltip-bg-a' as any]: theme.bgA,
                ['--vh-tooltip-bg-b' as any]: theme.bgB,
                ['--vh-tooltip-border' as any]: theme.border,
                ['--vh-tooltip-btn-a' as any]: theme.buttonA,
                ['--vh-tooltip-btn-b' as any]: theme.buttonB,
                ['--vh-tooltip-btn-text' as any]: theme.buttonText,
              }}
              onPointerEnter={() => {
                cancelClearHover();
                setHoveredUf(activePin.uf);
                setActiveUnitId(activePin.id);
              }}
              onPointerLeave={() => scheduleClearHover()}
            >
              <strong>{activePin.label}</strong>
              <span>Clique no marcador para entrar na visao do predio</span>
            </div>
              );
            })()
          )}

          {legendItems.length > 0 && (
            <div className="vh-marker-legend">
              {legendItems.map((item) => (
                <div className="vh-marker-legend-item" key={`legend_${item.key}`}>
                  <span className="vh-marker-legend-dot" style={{ background: item.color }} />
                  <span className="vh-marker-legend-label">{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
