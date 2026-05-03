import { useEffect, useMemo, useState } from 'react';
import { geoCentroid, geoMercator, geoPath } from 'd3-geo';

type UnitOption = { id: string; label: string };

type BrazilUnitsMapProps = {
  hospitals: UnitOption[];
  unitsLoading: boolean;
  onSelectUnit: (unitId: string) => void;
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
const MAP_HEIGHT = 700;

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

function extractUf(raw: string) {
  const match = raw.toUpperCase().match(/^\s*([A-Z]{2})\s*[- ]/);
  return match?.[1] || '';
}

function stateColorByCount(count: number) {
  if (count >= 3) return '#14532d';
  if (count === 2) return '#166534';
  if (count === 1) return '#15803d';
  return '#0f3a2a';
}

export function BrazilUnitsMap({ hospitals, unitsLoading, onSelectUnit }: BrazilUnitsMapProps) {
  const [geoData, setGeoData] = useState<GeoFeatureCollection | null>(null);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [hoveredUf, setHoveredUf] = useState<string | null>(null);

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

  const projection = useMemo(() => {
    if (!geoData) return null;
    const p = geoMercator().fitExtent(
      [[84, 56], [MAP_WIDTH - 84, MAP_HEIGHT - 92]],
      geoData as any
    );
    const t = p.translate();
    p.translate([t[0] - 20, t[1] - 16]);
    return p;
  }, [geoData]);

  const pathGen = useMemo(() => {
    if (!projection) return null;
    return geoPath(projection);
  }, [projection]);

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

  const unitPins = useMemo(() => {
    if (!projection) return [] as Array<{ id: string; label: string; uf: string; x: number; y: number; key: string }>;

    const prePins = hospitals.map((unit) => {
      const key = canonicalUnitKey(unit.id || unit.label);
      const known = UNIT_PIN_BASE[key];
      const uf = known?.uf || extractUf(unit.label) || extractUf(unit.id);

      if (known) {
        const point = projection([known.lng, known.lat]);
        if (point) {
          return { ...unit, key, uf, x: point[0], y: point[1] };
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
      pins.forEach((pin, idx) => {
        const offset = OFFSET_RING[idx] || [((idx % 2 === 0 ? 1 : -1) * (10 + idx * 2)), ((idx % 3) - 1) * 10];
        resolved.push({ ...pin, x: pin.x + offset[0], y: pin.y + offset[1] });
      });
    }

    return resolved;
  }, [hospitals, projection, stateCentroids]);

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
    }
    return labels;
  }, [geoData?.features, stateCentroids, unitPins]);

  return (
    <section className="vh-units vh-map-section">
      <h2>Visao hospitalar</h2>
      <p>Passe o mouse na unidade e clique para abrir o predio 3D.</p>
      {unitsLoading && <p>Carregando unidades...</p>}

      <div className="vh-map-shell">
        <div className="vh-map-3d-plane" />
        <div className="vh-map-viewport">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="vh-map-svg" role="img" aria-label="Mapa do Brasil com unidades">
            <defs>
              <filter id="vh-map-shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#031913" floodOpacity="0.55" />
              </filter>
              <filter id="vh-map-glow" x="-40%" y="-40%" width="220%" height="220%">
                <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#86efac" floodOpacity="0.52" />
              </filter>
            </defs>

            {geoData?.features.map((feature, idx) => {
              if (!pathGen) return null;
              const d = pathGen(feature as any);
              if (!d) return null;
              const uf = feature.properties?.sigla || '';
              const count = unitCountByUf.get(uf) || 0;
              const isHot = hoveredUf === uf || (activePin && activePin.uf === uf);

              return (
                <g key={`${uf}_${idx}`} className="vh-map-state-group">
                  <path d={d} className="vh-map-state-extrude" />
                  <path
                    d={d}
                    className={`vh-map-state ${isHot ? 'is-hot' : ''}`}
                    style={{ fill: stateColorByCount(count) }}
                    filter={isHot ? 'url(#vh-map-glow)' : 'url(#vh-map-shadow)'}
                  />
                </g>
              );
            })}

            {unitPins.map((pin) => {
              const isActive = activePin?.id === pin.id;
              return (
                <g
                  key={pin.id}
                  transform={`translate(${pin.x}, ${pin.y})`}
                  className={`vh-marker ${isActive ? 'is-active' : ''}`}
                  onPointerEnter={() => {
                    setActiveUnitId(pin.id);
                    setHoveredUf(pin.uf);
                  }}
                  onPointerLeave={() => {
                    setHoveredUf(null);
                  }}
                  onClick={() => onSelectUnit(pin.id)}
                >
                  <circle className="vh-marker-halo" r="11" />
                  <path
                    className="vh-marker-pin"
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
          </svg>

          {activePin && (
            <div
              className="vh-tooltip-3d"
              style={{ left: `${Math.min(MAP_WIDTH - 220, Math.max(20, activePin.x + 20)) / MAP_WIDTH * 100}%`, top: `${Math.min(MAP_HEIGHT - 120, Math.max(14, activePin.y - 90)) / MAP_HEIGHT * 100}%` }}
              onPointerEnter={() => setHoveredUf(activePin.uf)}
              onPointerLeave={() => setHoveredUf(null)}
            >
              <strong>{activePin.label}</strong>
              <span>Clique para entrar na visao do predio</span>
              <button onClick={() => onSelectUnit(activePin.id)}>Entrar no predio</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
