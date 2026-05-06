import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import duckdb from 'duckdb';

type SurgeryState = 'EM_SALA' | 'NO_ROLL_ESPERA' | 'FORA_FLUXO_ATIVO';

type CcSurgery = {
  nrCirurgia: string;
  nrAtendimento: string;
  unitKey: string;
  unitLabel: string;
  roomName: string;
  patientName: string;
  procedureName: string | null;
  doctorName: string | null;
  statusAgenda: string;
  lastEvent: string;
  lastEventAt: string | null;
  /** MIN(DT_REGISTRO) em movimentos de entrada na sala (ou primeiro instante “em sala”). */
  enteredRoomAt: string | null;
  /** MAX(DT_REGISTRO) em eventos de término/fim da cirurgia no movimento. */
  surgeryEndedAt: string | null;
  /** MIN(DT_REGISTRO) em eventos de saída do paciente/card da sala cirúrgica. */
  leftRoomAt: string | null;
  state: SurgeryState;
};

type CcUnitSummary = {
  unitKey: string;
  unitLabel: string;
  hasCenter: boolean;
  /** Dia UTC usado no filtro desta unidade (`YYYY-MM-DD`): em `per_unit`, dia global se houver linhas no lake nesse dia; senão último dia da unidade no extract. */
  referenceDay: string | null;
  surgeriesInRoom: number;
  waitingRoll: number;
  activeRooms: number;
  /** Cirurgias no recorte do dia já fora do fluxo ativo (último evento = saída ou não mapeado como sala/espera). */
  completedInScope: number;
  lastEventAt: string | null;
};

type CcSnapshot = {
  generatedAt: string;
  /** Dia UTC efetivo no filtro (após `referenceDayOffsetDays`). */
  referenceDay: string | null;
  /** Dia UTC do MAX(DT_REGISTRO) nos parquet, antes do offset. */
  lakeMaxDayUtc: string | null;
  /** Dias somados ao `lakeMaxDayUtc` para obter `referenceDay` (ex.: -1 = D−1 no lake). */
  referenceDayOffsetDays: number;
  /** `global`: só cirurgias no dia UTC da linha acima. `per_unit` (padrão): por unidade, preferindo esse dia se a unidade tiver movimento nele; senão último dia com evento da unidade. */
  dayScope: 'global' | 'per_unit';
  sourceWindow: { minEventAt: string | null; maxEventAt: string | null };
  totals: { surgeriesInRoom: number; waitingRoll: number; activeRooms: number };
  units: CcUnitSummary[];
  surgeries: CcSurgery[];
  roomCatalogByUnit: Record<string, string[]>;
};

type WsClient = { send: (payload: string) => void };

const app = Fastify({ logger: true });
app.register(cors);
app.register(websocket);

/** Pasta `modules/cc/api` (funciona com `tsx src/…` ou `dist/`). */
const CC_API_ROOT = path.resolve(__dirname, '..');
/** Raiz do monorepo (`censo-hospitalar`). */
const REPO_ROOT = path.resolve(CC_API_ROOT, '..', '..', '..');
const ORCHESTRATOR_SYNC_INTERVAL_SECONDS = Number(process.env.ORCHESTRATOR_SYNC_INTERVAL_SECONDS || 600);
const REFRESH_MS = ORCHESTRATOR_SYNC_INTERVAL_SECONDS * 1000;
const API_PORT = Number(process.env.CC_API_PORT || process.env.PORT || 3213);
const CC_DAY_SCOPE = (process.env.CC_DAY_SCOPE || 'global').toLowerCase() === 'global' ? 'global' : 'per_unit';
const CC_TREAT_UNKNOWN_AS_WAITING =
  String(process.env.CC_TREAT_UNKNOWN_AS_WAITING || 'false').toLowerCase() === 'true';

/**
 * Quantidade de colunas fixas `SALA - 01` … `SALA - NN` por cada unidade em `BASE_UNITS`
 * (antes de dados no parquet). Ajuste por hospital com `CC_FIXED_ROOMS_PER_UNIT` ou liste salas extra em `cc-room-catalog.json`.
 */
const CC_FIXED_ROOMS_PER_UNIT = (() => {
  const n = Number.parseInt(String(process.env.CC_FIXED_ROOMS_PER_UNIT ?? '3'), 10);
  if (Number.isNaN(n)) return 3;
  return Math.min(40, Math.max(1, n));
})();

/** Desloca o dia âncora do filtro em relação ao MAX(DT_REGISTRO) do parquet (UTC). Ex.: `-1` = D−1 no fim do lake; `CC_USE_D_MINUS_1=true` força `-1`. */
const CC_REFERENCE_DAY_OFFSET_DAYS = (() => {
  const raw = process.env.CC_REFERENCE_DAY_OFFSET_DAYS;
  if (raw !== undefined && String(raw).trim() !== '') {
    const n = Number.parseInt(String(raw), 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return String(process.env.CC_USE_D_MINUS_1 || '').toLowerCase() === 'true' ? -1 : 0;
})();

const BASE_UNITS = [
  'ES - HOSPITAL VITORIA',
  'ES - PS VV',
  'RJ - PS CAMPO GRANDE',
  'RJ - PS BOTAFOGO',
  'RJ - PS BARRA DA TIJUCA',
  'DF - PS SIG',
  'DF - PS TAGUATINGA',
  'MG BH GUTIERREZ - PS',
  'MG - PAMPULHA',
] as const;

const IN_ROOM_EVENTS = new Set([
  'entrada na sala cirurgica',
  'inicio da anestesia',
  'inicio de cirurgia',
  'termino da cirurgia',
  'fim da anestesia',
  'paciente na sala cirurgica',
  'paciente na sala',
  'inducao da anestesia',
  'inducao anestesica',
  'atuacao cirurgica',
  'durante a cirurgia',
  'em cirurgia',
]);

const WAITING_EVENTS = new Set([
  'entrada no centro cirurgico',
  'chegada ao centro cirurgico',
  'paciente no centro cirurgico',
  'aguardando sala',
  'aguardando cirurgia',
  'pre operatorio',
  'preoperatorio',
  'em preparacao',
  'checklist cirurgico',
  'na recepcao do centro cirurgico',
]);
const EXIT_EVENTS = new Set([
  'saida do paciente para ui',
  'saida do paciente para uti / upc',
  'saida do paciente para uti/upc',
  'saida do paciente da sala cirurgica',
  'saida do paciente para casa',
  'saida da sala cirurgica',
  'alta hospitalar',
  'alta medica',
  'obito',
]);

/** Cirurgias no recorte do dia (todos os estados); não vai no JSON gigante do WS, só uso interno + /rooms. */
let scopedSurgeriesCache: CcSurgery[] = [];

type CcBuildDiagnostics = {
  joinedRows: number;
  dayFiltered: number;
  scopedCount: number;
  activeCount: number;
  /** Contagem por estado no mesmo recorte do dia filtrado (último evento por cirurgia). */
  statesInScopedSlice: Record<SurgeryState, number>;
  distinctEvents: { label: string; count: number }[];
  /** Baseline + JSON opcional fundidos com parquets — salas fixas à espera de dados. */
  roomCatalogOverlay?: {
    baselineSlotsPerUnit: number;
    fileSources: string[];
    mergedOverlayUnits: number;
    mergedOverlaySlots: number;
  };
  /** Erros ao ler/parsear catálogo opcional (ficheiro inválido, path inexistente, etc.). */
  roomCatalogOverlayErrors?: string[];
};

let lastBuildDiagnostics: CcBuildDiagnostics = {
  joinedRows: 0,
  dayFiltered: 0,
  scopedCount: 0,
  activeCount: 0,
  statesInScopedSlice: { EM_SALA: 0, NO_ROLL_ESPERA: 0, FORA_FLUXO_ATIVO: 0 },
  distinctEvents: [],
  roomCatalogOverlay: {
    baselineSlotsPerUnit: CC_FIXED_ROOMS_PER_UNIT,
    fileSources: [],
    mergedOverlayUnits: 0,
    mergedOverlaySlots: 0,
  },
};

let snapshot: CcSnapshot = {
  generatedAt: new Date(0).toISOString(),
  referenceDay: null,
  lakeMaxDayUtc: null,
  referenceDayOffsetDays: CC_REFERENCE_DAY_OFFSET_DAYS,
  dayScope: CC_DAY_SCOPE,
  sourceWindow: { minEventAt: null, maxEventAt: null },
  totals: { surgeriesInRoom: 0, waitingRoll: 0, activeRooms: 0 },
  units: [],
  surgeries: [],
  roomCatalogByUnit: {},
};

const sockets = new Set<WsClient>();

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(HOSPITAL|PS|PRONTO|SOCORRO)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalUnitKey(raw: unknown) {
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

function unitLabelFromKey(unitKey: string) {
  const found = BASE_UNITS.find((unit) => canonicalUnitKey(unit) === unitKey);
  return found || unitKey.replace(/_/g, ' ');
}

function stripEdgeNoise(value: string) {
  return value.replace(/^[\s.:;,\-_]+/g, '').replace(/[\s.:;,\-_]+$/g, '').trim();
}

function normalizeEvent(value: unknown) {
  const s = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return stripEdgeNoise(s);
}

/** Igualdade exata ou frase conhecida como substring (fontes costumam acrescentar texto/pontuação). */
function eventMatchesPhrase(ev: string, phrases: Set<string>, minLenForIncludes: number): boolean {
  if (!ev) return false;
  if (phrases.has(ev)) return true;
  const trimmed = stripEdgeNoise(ev);
  if (phrases.has(trimmed)) return true;
  for (const p of phrases) {
    if (p.length < minLenForIncludes) continue;
    if (ev.includes(p) || trimmed.includes(p)) return true;
  }
  return false;
}

type ClinicalOutcome = 'ALTA' | 'INTERNACAO' | 'OBITO';

function clinicalOutcomeFromLastEvent(lastEvent: string): ClinicalOutcome | null {
  const ev = normalizeEvent(lastEvent);
  if (!ev) return null;
  if (ev.includes('obito')) return 'OBITO';
  if (
    ev.includes('uti') ||
    ev.includes('upc') ||
    ev.includes('para ui') ||
    ev.includes('internacao') ||
    ev.includes('internado') ||
    (ev.includes('intern') && (ev.includes('enferm') || ev.includes('enfermaria'))) ||
    ev.includes('enfermaria') ||
    ev.includes('hospitaliz')
  ) {
    return 'INTERNACAO';
  }
  if (
    ev.includes('para casa') ||
    (ev.includes('saida') && ev.includes('casa')) ||
    ev.includes('alta hospitalar') ||
    ev.includes('alta medica') ||
    ev.includes('alta médica') ||
    ev.includes('alta enfermaria') ||
    (ev.includes('alta') && (ev.includes('paciente') || ev.includes('medica') || ev.includes('hospitalar')))
  ) {
    return 'ALTA';
  }
  return null;
}

function resolveState(lastEvent: string, statusAgenda: string): SurgeryState {
  const ev = normalizeEvent(lastEvent);
  const status = normalizeEvent(statusAgenda);
  if (eventMatchesPhrase(ev, EXIT_EVENTS, 5)) return 'FORA_FLUXO_ATIVO';
  if (eventMatchesPhrase(ev, IN_ROOM_EVENTS, 8)) return 'EM_SALA';
  if (
    eventMatchesPhrase(ev, WAITING_EVENTS, 10) ||
    status === 'aguardando' ||
    status === 'marcada'
  ) {
    return 'NO_ROLL_ESPERA';
  }
  if (
    status.includes('aguard') ||
    status.includes('marcad') ||
    status.includes('prepar') ||
    status.includes('centro cirurgico')
  ) {
    return 'NO_ROLL_ESPERA';
  }
  if (CC_TREAT_UNKNOWN_AS_WAITING && ev.length > 2) return 'NO_ROLL_ESPERA';
  return 'FORA_FLUXO_ATIVO';
}

function isTestPatient(name: string) {
  const n = normalizeText(name);
  return n.includes('TESTE') || n.includes('PACIENTE TESTE');
}

function canonicalRoomKey(raw: string) {
  const t = normalizeText(raw);
  const sala = t.match(/\b(?:SALA|SAL)\s*0*(\d{1,2})\b/);
  if (sala?.[1]) {
    const n = Number(sala[1]);
    if (Number.isFinite(n)) return `SALA_${String(n).padStart(2, '0')}`;
  }
  return t || 'SEM_SALA';
}

function roomLabelFromRaw(raw: string) {
  const key = canonicalRoomKey(raw);
  if (key.startsWith('SALA_')) {
    const n = Number(key.replace('SALA_', ''));
    return `SALA - ${String(n).padStart(2, '0')}`;
  }
  return (raw || 'SEM_SALA').trim() || 'SEM_SALA';
}

function isCcPlaceholderRoom(name: string) {
  return /^(sem\s*sala|sem\s*agenda)$/i.test(name.trim()) || name.trim() === 'SEM_SALA';
}

/** Ordena "SALA - 01" numericamente; outras chaves no fim, por locale. */
function salaNumericForSort(name: string): number {
  const m = String(name).match(/^SALA\s*-\s*0*(\d+)\s*$/i);
  return m ? Number(m[1]) : 1_000_000;
}

/** Ordenação estável para colunas do painel (sala numérica primeiro). */
function sortRoomsForDisplay(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const da = salaNumericForSort(a);
    const db = salaNumericForSort(b);
    if (da !== db) return da - db;
    return a.localeCompare(b, 'pt-BR');
  });
}

/**
 * JSON com salas por unidade (`unitKey` como em `/api/cc/units`). Chaves iniciadas por `_` são ignoradas.
 * Valores: array de strings (rótulos ou texto cru de agenda — normalizamos com `roomLabelFromRaw`).
 */
type CcRoomCatalogFile = Record<string, unknown>;

function parseRoomCatalogPayload(raw: string, label: string): { ok: Record<string, string[]>; err?: string } {
  try {
    const parsed = JSON.parse(raw) as CcRoomCatalogFile;
    const mergeInto = new Map<string, string[]>();
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('_')) continue;
      const unitKey = canonicalUnitKey(k);
      if (!unitKey) continue;
      const list = Array.isArray(v) ? v : [];
      const acc = mergeInto.get(unitKey) || [];
      const seen = new Set(acc);
      for (const item of list) {
        const roomLabel = roomLabelFromRaw(String(item ?? ''));
        if (!roomLabel || isCcPlaceholderRoom(roomLabel)) continue;
        if (seen.has(roomLabel)) continue;
        seen.add(roomLabel);
        acc.push(roomLabel);
      }
      mergeInto.set(unitKey, acc);
    }
    return { ok: Object.fromEntries(mergeInto) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: {}, err: `${label}: ${msg}` };
  }
}

type CcRoomCatalogLoadResult = {
  overlay: Record<string, string[]>;
  sources: string[];
  errors: string[];
};

/**
 * Catálogo explícito de salas (opcional): deploy à espera de dados do DB/parquet.
 *
 * Fontes (por ordem, acumuladas): `CC_ROOM_CATALOG_JSON`, ficheiro em `CC_ROOM_CATALOG_PATH`,
 * `modules/cc/api/config/cc-room-catalog.json`, `{CC_DADOS_DIR|datalake}/cc-room-catalog.json`.
 */
function loadCcRoomCatalogOverlay(dataDir: string): CcRoomCatalogLoadResult {
  const accumulated = new Map<string, string[]>();
  const sources: string[] = [];
  const errors: string[] = [];

  const accumulate = (partial: Record<string, string[]>) => {
    for (const [uk, rooms] of Object.entries(partial)) {
      const acc = accumulated.get(uk) || [];
      const seen = new Set(acc);
      for (const r of rooms) {
        if (seen.has(r)) continue;
        seen.add(r);
        acc.push(r);
      }
      accumulated.set(uk, acc);
    }
  };

  const tryParse = (label: string, raw: string) => {
    const { ok, err } = parseRoomCatalogPayload(raw, label);
    if (err) errors.push(err);
    else if (Object.keys(ok).length > 0) {
      sources.push(label);
      accumulate(ok);
    }
  };

  const envJson = process.env.CC_ROOM_CATALOG_JSON?.trim();
  if (envJson) tryParse('env:CC_ROOM_CATALOG_JSON', envJson);

  const envPath = process.env.CC_ROOM_CATALOG_PATH?.trim();
  if (envPath) {
    const p = path.resolve(envPath);
    if (fs.existsSync(p)) {
      tryParse(`file:${p}`, fs.readFileSync(p, 'utf8'));
    } else {
      errors.push(`file:${p}: caminho não encontrado`);
    }
  }

  const defaultPaths = [
    path.join(CC_API_ROOT, 'config', 'cc-room-catalog.json'),
    path.join(dataDir, 'cc-room-catalog.json'),
  ];
  for (const p of defaultPaths) {
    if (fs.existsSync(p)) tryParse(`file:${p}`, fs.readFileSync(p, 'utf8'));
  }

  const overlay: Record<string, string[]> = {};
  for (const [uk, rooms] of accumulated) {
    overlay[uk] = rooms;
  }

  return { overlay, sources, errors };
}

/** `SALA - 01` … `SALA - NN` para cada unidade do manifesto (painel sempre com colunas). */
function baselineRoomSlotsByUnit(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const label of BASE_UNITS) {
    const uk = canonicalUnitKey(label);
    if (!uk) continue;
    const rooms: string[] = [];
    for (let i = 1; i <= CC_FIXED_ROOMS_PER_UNIT; i++) {
      rooms.push(`SALA - ${String(i).padStart(2, '0')}`);
    }
    out[uk] = rooms;
  }
  return out;
}

/** Ordema salas do JSON à frente; acrescenta slots baseline que ainda não existem. */
function combineBaselineAndFileOverlay(
  baseline: Record<string, string[]>,
  file: Record<string, string[]>,
): Record<string, string[]> {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(file)]);
  const out: Record<string, string[]> = {};
  for (const uk of keys) {
    const explicit = file[uk] || [];
    const fall = baseline[uk] || [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const r of explicit) {
      if (seen.has(r)) continue;
      seen.add(r);
      ordered.push(r);
    }
    for (const r of fall) {
      if (seen.has(r)) continue;
      seen.add(r);
      ordered.push(r);
    }
    out[uk] = ordered;
  }
  return out;
}

/** Funde overlay (baseline + JSON) com salas vistas nos parquets; ordena para exibição. */
function mergeParquetAndOverlayRooms(
  fromParquet: Record<string, string[]>,
  overlay: Record<string, string[]>,
): Record<string, string[]> {
  const unitKeys = new Set([...Object.keys(fromParquet), ...Object.keys(overlay)]);
  const merged: Record<string, string[]> = {};
  for (const unitKey of unitKeys) {
    const pref = overlay[unitKey] || [];
    const data = fromParquet[unitKey] || [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const r of pref) {
      if (seen.has(r)) continue;
      seen.add(r);
      ordered.push(r);
    }
    for (const r of data) {
      if (seen.has(r)) continue;
      seen.add(r);
      ordered.push(r);
    }
    merged[unitKey] = sortRoomsForDisplay(ordered);
  }
  return merged;
}

function resolveDataDir() {
  if (process.env.CC_DADOS_DIR) return path.resolve(process.env.CC_DADOS_DIR);
  const candidates = [
    path.resolve(REPO_ROOT, 'datalake', 'hospital'),
    path.resolve(REPO_ROOT, '..', '..', '..', '..', 'datalake', 'hospital'),
    path.resolve(REPO_ROOT, '..', '..', '..', 'datalake', 'hospital'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'tbl_centro_cirurgico_bkp.parquet'))) return dir;
  }
  return candidates[0];
}


function quoteSqlPath(filePath: string) {
  return path.resolve(filePath).replace(/\\/g, '/').replace(/'/g, "''");
}

/** Converte DT_REGISTRO / timestamp vindo do DuckDB em ISO UTC sem lançar em datas inválidas. */
function parseMovTimestamp(raw: unknown): string | null {
  if (raw == null) return null;
  try {
    if (typeof raw === 'bigint') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      const ms = n > 1e15 ? n / 1000 : n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const ms = raw > 1e15 ? raw / 1000 : raw > 1e12 ? raw : raw * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
    }
    const s = String(raw).trim();
    if (!s || s === 'null' || s === 'undefined') return null;
    let d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/);
    if (m) {
      d = new Date(`${m[1]}T${m[2]}Z`);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

/** Chave YYYY-MM-DD em UTC para comparar “dia do evento” com o último dia da tabela. */
function utcDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftUtcDayKey(day: string | null, deltaDays: number): string | null {
  if (day == null || deltaDays === 0) return day;
  const parts = day.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return day;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return utcDayKeyFromIso(dt.toISOString());
}

function rowToJson(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') {
      const n = Number(v);
      out[k] = Number.isSafeInteger(n) ? n : v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function queryRows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  return await new Promise((resolve, reject) => {
    const db = new duckdb.Database(':memory:');
    const conn = db.connect();
    conn.all(sql, (err: Error | null, rows?: Record<string, unknown>[]) => {
      conn.close(() => db.close(() => undefined));
      if (err) {
        reject(err);
        return;
      }
      const mapped = (rows || []).map((r) => rowToJson(r) as T);
      resolve(mapped);
    });
  });
}

async function buildSnapshot() {
  const dataDir = resolveDataDir();
  const bkpPath = quoteSqlPath(path.join(dataDir, 'tbl_centro_cirurgico_bkp.parquet'));
  const movPath = quoteSqlPath(path.join(dataDir, 'tbl_cc_tempos_mov.parquet'));

  const rows = await queryRows<{
    NR_CIRURGIA: string | number | null;
    NR_ATENDIMENTO: string | number | null;
    UNIDADE: string | null;
    DS_AGENDA: string | null;
    NM_PACIENTE: string | null;
    DS_PROCEDIMENTO: string | null;
    MEDICO: string | null;
    STATUS_AGENDA: string | null;
    DS_EVENTO: string | null;
    DT_EVENTO: string | Date | null;
    TS_ENTRADA_SALA: string | Date | null;
    TS_FIM_CIRURGIA: string | Date | null;
    TS_SAIDA_SALA: string | Date | null;
  }>(`
    WITH last_event AS (
      SELECT
        NR_CIRURGIA,
        DS_EVENTO,
        try_cast(DT_REGISTRO AS timestamp) AS DT_EVENTO,
        row_number() OVER (
          PARTITION BY NR_CIRURGIA
          ORDER BY try_cast(DT_REGISTRO AS timestamp) DESC NULLS LAST, NR_SEQ_EVENTO DESC
        ) AS rn
      FROM read_parquet('${movPath}')
      WHERE NR_CIRURGIA IS NOT NULL
    ),
    mov_milestones AS (
      SELECT
        NR_CIRURGIA,
        COALESCE(
          MIN(CASE
            WHEN (
              lower(COALESCE(DS_EVENTO, '')) LIKE '%entrada%na%sala%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%paciente%na%sala%cirurg%'
              OR (
                lower(COALESCE(DS_EVENTO, '')) LIKE '%paciente%na%sala%'
                AND lower(COALESCE(DS_EVENTO, '')) NOT LIKE '%centro%cirurg%'
              )
            ) THEN try_cast(DT_REGISTRO AS timestamp)
            ELSE NULL
          END),
          MIN(CASE
            WHEN (
              lower(COALESCE(DS_EVENTO, '')) LIKE '%fim%anestesia%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%inicio%anestesia%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%início%anestesia%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%inicio%de%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%início%de%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%inducao%anest%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%indução%anest%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%atuacao%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%atuação%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%durante%a%cirurg%'
              OR lower(COALESCE(DS_EVENTO, '')) LIKE '%em cirurgia%'
            )
              AND lower(COALESCE(DS_EVENTO, '')) NOT LIKE '%termino%da%cirurg%'
              AND lower(COALESCE(DS_EVENTO, '')) NOT LIKE '%término%da%cirurg%'
              AND lower(COALESCE(DS_EVENTO, '')) NOT LIKE '%fim%da%cirurg%'
            THEN try_cast(DT_REGISTRO AS timestamp)
            ELSE NULL
          END)
        ) AS TS_ENTRADA_SALA,
        MAX(CASE
          WHEN (
            lower(COALESCE(DS_EVENTO, '')) LIKE '%termino%da%cirurg%'
            OR lower(COALESCE(DS_EVENTO, '')) LIKE '%término%da%cirurg%'
            OR lower(COALESCE(DS_EVENTO, '')) LIKE '%fim%da%cirurg%'
          ) THEN try_cast(DT_REGISTRO AS timestamp)
          ELSE NULL
        END) AS TS_FIM_CIRURGIA,
        MIN(CASE
          WHEN (
            lower(COALESCE(DS_EVENTO, '')) LIKE '%saida%da%sala%cirurg%'
            OR lower(COALESCE(DS_EVENTO, '')) LIKE '%saida%paciente%da%sala%cirurg%'
            OR lower(COALESCE(DS_EVENTO, '')) LIKE '%saida do paciente da sala cirurgica%'
            OR lower(COALESCE(DS_EVENTO, '')) LIKE '%saida da sala cirurgica%'
          ) THEN try_cast(DT_REGISTRO AS timestamp)
          ELSE NULL
        END) AS TS_SAIDA_SALA
      FROM read_parquet('${movPath}')
      WHERE NR_CIRURGIA IS NOT NULL
      GROUP BY NR_CIRURGIA
    ),
    bkp_dedup AS (
      SELECT *
      FROM (
        SELECT
          NR_CIRURGIA,
          NR_ATENDIMENTO,
          UNIDADE,
          DS_AGENDA,
          NM_PACIENTE,
          DS_PROCEDIMENTO,
          MEDICO,
          STATUS_AGENDA,
          row_number() OVER (
            PARTITION BY NR_CIRURGIA
            ORDER BY try_cast(DT_CARGA AS timestamp) DESC NULLS LAST, try_cast(HR_INICIO AS timestamp) DESC NULLS LAST
          ) AS rn
        FROM read_parquet('${bkpPath}')
        WHERE NR_CIRURGIA IS NOT NULL
      ) x
      WHERE rn = 1
    )
    SELECT
      b.NR_CIRURGIA,
      b.NR_ATENDIMENTO,
      b.UNIDADE,
      b.DS_AGENDA,
      b.NM_PACIENTE,
      b.DS_PROCEDIMENTO,
      b.MEDICO,
      b.STATUS_AGENDA,
      le.DS_EVENTO,
      le.DT_EVENTO,
      mm.TS_ENTRADA_SALA,
      mm.TS_FIM_CIRURGIA,
      mm.TS_SAIDA_SALA
    FROM bkp_dedup b
    LEFT JOIN last_event le
      ON b.NR_CIRURGIA = le.NR_CIRURGIA
      AND le.rn = 1
    LEFT JOIN mov_milestones mm
      ON b.NR_CIRURGIA = mm.NR_CIRURGIA
  `);

  const allSurgeries: CcSurgery[] = rows
    .map((row) => {
      const unitKey = canonicalUnitKey(row.UNIDADE || '');
      const unitLabel = unitLabelFromKey(unitKey);
      const lastEventAt = parseMovTimestamp(row.DT_EVENTO);
      const enteredRoomAt = parseMovTimestamp(row.TS_ENTRADA_SALA);
      const surgeryEndedAt = parseMovTimestamp(row.TS_FIM_CIRURGIA);
      const leftRoomAt = parseMovTimestamp(row.TS_SAIDA_SALA);
      return {
        nrCirurgia: String(row.NR_CIRURGIA || ''),
        nrAtendimento: String(row.NR_ATENDIMENTO || ''),
        unitKey,
        unitLabel,
        roomName: roomLabelFromRaw(String(row.DS_AGENDA || 'SEM_SALA')),
        patientName: String(row.NM_PACIENTE || 'Sem paciente'),
        procedureName:
          row.DS_PROCEDIMENTO != null && String(row.DS_PROCEDIMENTO).trim() !== ''
            ? String(row.DS_PROCEDIMENTO)
            : null,
        doctorName:
          row.MEDICO != null && String(row.MEDICO).trim() !== '' ? String(row.MEDICO) : null,
        statusAgenda: String(row.STATUS_AGENDA || 'Sem status'),
        lastEvent: String(row.DS_EVENTO || 'Sem evento'),
        lastEventAt,
        enteredRoomAt,
        surgeryEndedAt,
        leftRoomAt,
        state: resolveState(String(row.DS_EVENTO || ''), String(row.STATUS_AGENDA || '')),
      };
    })
    .filter((surgery) => surgery.unitKey !== '')
    .filter((surgery) => !isTestPatient(surgery.patientName));

  const historicalUnits = new Set(allSurgeries.map((s) => s.unitKey));

  let referenceDay: string | null = null;
  const joinedTimes = allSurgeries
    .map((s) => s.lastEventAt)
    .filter((v): v is string => v != null && v !== '');
  const joinedMaxIso =
    joinedTimes.length > 0 ? joinedTimes.reduce((a, b) => (a > b ? a : b)) : null;
  if (joinedMaxIso) {
    referenceDay = utcDayKeyFromIso(joinedMaxIso);
  }

  const lakeMaxDayUtc = referenceDay;
  referenceDay = shiftUtcDayKey(lakeMaxDayUtc, CC_REFERENCE_DAY_OFFSET_DAYS);

  const unitLastEventMs = new Map<string, number>();
  for (const s of allSurgeries) {
    if (!s.lastEventAt) continue;
    const ms = new Date(s.lastEventAt).getTime();
    if (Number.isNaN(ms)) continue;
    const prev = unitLastEventMs.get(s.unitKey);
    if (prev == null || ms > prev) unitLastEventMs.set(s.unitKey, ms);
  }
  const unitReferenceDay = new Map<string, string>();
  for (const [uk, ms] of unitLastEventMs) {
    unitReferenceDay.set(uk, utcDayKeyFromIso(new Date(ms).toISOString()));
  }

  /**
   * Dia usado no filtro “por unidade”: se existir movimento desta unidade no dia global
   * (`referenceDay` = MAX movimento no lake), usa esse dia; senão usa o último dia em que a
   * unidade teve evento no extract. Evita ficar preso a um dia antigo quando já há linhas no dia atual da base.
   */
  const unitFilterDay = new Map<string, string>();
  if (CC_DAY_SCOPE === 'per_unit') {
    const unitKeys = new Set(allSurgeries.map((s) => s.unitKey));
    for (const uk of unitKeys) {
      const unitMax = unitReferenceDay.get(uk);
      if (referenceDay != null) {
        const hasOnGlobalDay = allSurgeries.some(
          (s) =>
            s.unitKey === uk && s.lastEventAt != null && utcDayKeyFromIso(s.lastEventAt) === referenceDay
        );
        if (hasOnGlobalDay) unitFilterDay.set(uk, referenceDay);
        else if (unitMax != null) unitFilterDay.set(uk, unitMax);
      } else if (unitMax != null) {
        unitFilterDay.set(uk, unitMax);
      }
    }
  }

  const daySurgeries =
    CC_DAY_SCOPE === 'global'
      ? referenceDay != null
        ? allSurgeries.filter((s) => s.lastEventAt && utcDayKeyFromIso(s.lastEventAt) === referenceDay)
        : []
      : allSurgeries.filter((s) => {
          if (!s.lastEventAt) return false;
          const d = unitFilterDay.get(s.unitKey);
          return d != null && utcDayKeyFromIso(s.lastEventAt) === d;
        });

  const surgeries = daySurgeries;
  const active = surgeries.filter((s) => s.state !== 'FORA_FLUXO_ATIVO');

  const unitMap = new Map<string, CcUnitSummary>();
  for (const baseUnit of BASE_UNITS) {
    const key = canonicalUnitKey(baseUnit);
    unitMap.set(key, {
      unitKey: key,
      unitLabel: baseUnit,
      hasCenter: historicalUnits.has(key),
      referenceDay:
        CC_DAY_SCOPE === 'per_unit'
          ? unitFilterDay.get(key) ?? unitReferenceDay.get(key) ?? null
          : referenceDay,
      surgeriesInRoom: 0,
      waitingRoll: 0,
      activeRooms: 0,
      completedInScope: 0,
      lastEventAt: null,
    });
  }
  for (const uk of historicalUnits) {
    if (!unitMap.has(uk)) {
      unitMap.set(uk, {
        unitKey: uk,
        unitLabel: unitLabelFromKey(uk),
        hasCenter: true,
        referenceDay:
          CC_DAY_SCOPE === 'per_unit'
            ? unitFilterDay.get(uk) ?? unitReferenceDay.get(uk) ?? null
            : referenceDay,
        surgeriesInRoom: 0,
        waitingRoll: 0,
        activeRooms: 0,
        completedInScope: 0,
        lastEventAt: null,
      });
    }
  }

  const roomsByUnit = new Map<string, Set<string>>();
  for (const surgery of active) {
    const current = unitMap.get(surgery.unitKey);
    if (!current) continue;

    if (surgery.state === 'EM_SALA') current.surgeriesInRoom += 1;
    if (surgery.state === 'NO_ROLL_ESPERA') current.waitingRoll += 1;
    if (surgery.lastEventAt && (!current.lastEventAt || surgery.lastEventAt > current.lastEventAt)) {
      current.lastEventAt = surgery.lastEventAt;
    }
    unitMap.set(surgery.unitKey, current);

    if (surgery.state === 'EM_SALA') {
      const rooms = roomsByUnit.get(surgery.unitKey) || new Set<string>();
      rooms.add(surgery.roomName);
      roomsByUnit.set(surgery.unitKey, rooms);
    }
  }

  for (const [unitKey, summary] of unitMap.entries()) {
    summary.activeRooms = roomsByUnit.get(unitKey)?.size || 0;
  }

  for (const surgery of surgeries) {
    const row = unitMap.get(surgery.unitKey);
    if (!row) continue;
    if (surgery.state === 'FORA_FLUXO_ATIVO') row.completedInScope += 1;
    unitMap.set(surgery.unitKey, row);
  }

  const units = [...unitMap.values()].sort((a, b) => a.unitLabel.localeCompare(b.unitLabel));

  /** Catálogo por unidade a partir de **todo** o extract (não só o dia filtrado), para todas as salas já vistas nos dados aparecerem no painel mesmo vazias no recorte. */
  const roomCatalogMap = new Map<string, Map<string, number>>();
  for (const surgery of allSurgeries) {
    if (isCcPlaceholderRoom(surgery.roomName)) continue;
    const byRoom = roomCatalogMap.get(surgery.unitKey) || new Map<string, number>();
    byRoom.set(surgery.roomName, (byRoom.get(surgery.roomName) || 0) + 1);
    roomCatalogMap.set(surgery.unitKey, byRoom);
  }
  const roomCatalogByUnitFromParquet: Record<string, string[]> = {};
  for (const [unitKey, byRoom] of roomCatalogMap.entries()) {
    const byFrequency = [...byRoom.entries()].sort((a, b) => b[1] - a[1]).map((entry) => entry[0]);
    roomCatalogByUnitFromParquet[unitKey] = sortRoomsForDisplay(byFrequency);
  }

  const overlayLoad = loadCcRoomCatalogOverlay(dataDir);
  if (overlayLoad.errors.length > 0) {
    for (const err of overlayLoad.errors) {
      app.log.warn({ err }, 'CC room catalog overlay');
    }
  }
  const combinedOverlay = combineBaselineAndFileOverlay(baselineRoomSlotsByUnit(), overlayLoad.overlay);
  const roomCatalogByUnit = mergeParquetAndOverlayRooms(roomCatalogByUnitFromParquet, combinedOverlay);

  const allEventTimes = surgeries.map((s) => s.lastEventAt).filter(Boolean) as string[];
  const minEventAt = allEventTimes.length > 0 ? allEventTimes.reduce((a, b) => (a < b ? a : b)) : null;
  const maxEventAt = allEventTimes.length > 0 ? allEventTimes.reduce((a, b) => (a > b ? a : b)) : null;

  scopedSurgeriesCache = surgeries;

  const evHistogram = new Map<string, number>();
  const statesInScopedSlice: Record<SurgeryState, number> = {
    EM_SALA: 0,
    NO_ROLL_ESPERA: 0,
    FORA_FLUXO_ATIVO: 0,
  };
  for (const s of surgeries) {
    statesInScopedSlice[s.state] += 1;
    const label = (s.lastEvent || '—').slice(0, 160);
    evHistogram.set(label, (evHistogram.get(label) || 0) + 1);
  }
  lastBuildDiagnostics = {
    joinedRows: allSurgeries.length,
    dayFiltered: daySurgeries.length,
    scopedCount: surgeries.length,
    activeCount: active.length,
    statesInScopedSlice,
    distinctEvents: [...evHistogram.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([label, count]) => ({ label, count })),
    roomCatalogOverlay: {
      baselineSlotsPerUnit: CC_FIXED_ROOMS_PER_UNIT,
      fileSources: overlayLoad.sources,
      mergedOverlayUnits: Object.keys(combinedOverlay).length,
      mergedOverlaySlots: Object.values(combinedOverlay).reduce((acc, rooms) => acc + rooms.length, 0),
    },
    ...(overlayLoad.errors.length > 0 ? { roomCatalogOverlayErrors: overlayLoad.errors } : {}),
  };

  snapshot = {
    generatedAt: new Date().toISOString(),
    referenceDay,
    lakeMaxDayUtc,
    referenceDayOffsetDays: CC_REFERENCE_DAY_OFFSET_DAYS,
    dayScope: CC_DAY_SCOPE,
    sourceWindow: { minEventAt, maxEventAt },
    totals: {
      surgeriesInRoom: active.filter((s) => s.state === 'EM_SALA').length,
      waitingRoll: active.filter((s) => s.state === 'NO_ROLL_ESPERA').length,
      activeRooms: new Set(active.filter((s) => s.state === 'EM_SALA').map((s) => `${s.unitKey}::${s.roomName}`)).size,
    },
    units,
    surgeries: active,
    roomCatalogByUnit,
  };
}

function broadcastSnapshot() {
  const payload = JSON.stringify({ type: 'CC_STATE_UPDATED', snapshot });
  for (const socket of sockets) {
    try {
      socket.send(payload);
    } catch {
      sockets.delete(socket);
    }
  }
}

async function refreshAndBroadcast() {
  try {
    await buildSnapshot();
    broadcastSnapshot();
    app.log.info(
      {
        referenceDay: snapshot.referenceDay,
        lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
        referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
        inRoom: snapshot.totals.surgeriesInRoom,
        waiting: snapshot.totals.waitingRoll,
        activeRooms: snapshot.totals.activeRooms,
        generatedAt: snapshot.generatedAt,
      },
      'Snapshot CC atualizado.'
    );
  } catch (err) {
    app.log.error({ err }, 'Falha ao atualizar snapshot de Centro Cirúrgico.');
  }
}

app.get('/api/health', async () => ({
  ok: true,
  generatedAt: snapshot.generatedAt,
  referenceDay: snapshot.referenceDay,
  lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
  referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
  totals: snapshot.totals,
  sourceWindow: snapshot.sourceWindow,
  dataDir: resolveDataDir(),
}));

app.get('/api/cc/summary', async () => ({
  generatedAt: snapshot.generatedAt,
  referenceDay: snapshot.referenceDay,
  lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
  referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
  totals: snapshot.totals,
  sourceWindow: snapshot.sourceWindow,
}));

app.get('/api/cc/units', async () => ({
  generatedAt: snapshot.generatedAt,
  referenceDay: snapshot.referenceDay,
  lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
  referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
  dayScope: snapshot.dayScope,
  units: snapshot.units,
}));

app.get('/api/cc/diagnostics', async () => ({
  generatedAt: snapshot.generatedAt,
  referenceDay: snapshot.referenceDay,
  lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
  referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
  dayScope: snapshot.dayScope,
  dataDir: resolveDataDir(),
  ...lastBuildDiagnostics,
}));

function patientPayload(s: CcSurgery) {
  return {
    nrCirurgia: s.nrCirurgia,
    patientName: s.patientName,
    procedureName: s.procedureName,
    doctorName: s.doctorName,
    lastEvent: s.lastEvent,
    lastEventAt: s.lastEventAt,
    roomEnteredAt: s.enteredRoomAt ?? null,
    state: s.state,
  };
}

function completedPatientPayload(s: CcSurgery) {
  const outcome = clinicalOutcomeFromLastEvent(s.lastEvent);
  const base = {
    nrCirurgia: s.nrCirurgia,
    patientName: s.patientName,
    procedureName: s.procedureName,
    doctorName: s.doctorName,
    lastEventAt: s.lastEventAt ?? null,
    surgeryEndedAt: s.surgeryEndedAt ?? null,
    roomLeftAt: s.leftRoomAt ?? null,
    clinicalOutcome: outcome,
  };
  if (!outcome) {
    return { ...base, lastEvent: s.lastEvent };
  }
  return base;
}

app.get<{ Querystring: { unit?: string } }>('/api/cc/rooms', async (req) => {
  const unit = req.query.unit || '';
  const normalized = canonicalUnitKey(unit);
  const scoped = scopedSurgeriesCache.filter((s) => s.unitKey === normalized);
  const isPhRoom = (name: string) => isCcPlaceholderRoom(name);

  let roomOrder = snapshot.roomCatalogByUnit[normalized] || [];
  if (roomOrder.length === 0 && scoped.some((s) => !isPhRoom(s.roomName))) {
    roomOrder = [
      ...new Set(scoped.map((s) => s.roomName).filter((n) => !isPhRoom(n))),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  if (roomOrder.length === 0 && scoped.length > 0) {
    roomOrder = ['SEM_SALA'];
  }

  const rooms = roomOrder.map((roomName) => {
    const inRoom = scoped
      .filter((s) => s.roomName === roomName && s.state === 'EM_SALA')
      .sort((a, b) => (b.lastEventAt || '').localeCompare(a.lastEventAt || ''));
    const waiting = scoped
      .filter((s) => s.roomName === roomName && s.state === 'NO_ROLL_ESPERA')
      .sort((a, b) => (b.lastEventAt || '').localeCompare(a.lastEventAt || ''));
    const completed = scoped
      .filter((s) => s.roomName === roomName && s.state === 'FORA_FLUXO_ATIVO')
      .sort((a, b) => (b.lastEventAt || '').localeCompare(a.lastEventAt || ''));
    const current = inRoom[0] || null;
    return {
      roomName,
      currentPatient: current ? patientPayload(current) : null,
      waitingPatients: waiting.map(patientPayload),
      completedPatients: completed.map(completedPatientPayload),
      inRoomCount: inRoom.length,
      waitingCount: waiting.length,
      completedCount: completed.length,
    };
  });

  return {
    generatedAt: snapshot.generatedAt,
    referenceDay: snapshot.referenceDay,
    lakeMaxDayUtc: snapshot.lakeMaxDayUtc,
    referenceDayOffsetDays: snapshot.referenceDayOffsetDays,
    dayScope: snapshot.dayScope,
    unitKey: normalized,
    rooms,
  };
});

app.register(async (instance) => {
  instance.get('/ws/cc-state', { websocket: true }, (socket) => {
    sockets.add(socket as unknown as WsClient);
    socket.send(JSON.stringify({ type: 'CC_SNAPSHOT', snapshot }));
    socket.on('close', () => sockets.delete(socket as unknown as WsClient));
  });
});

async function start() {
  await refreshAndBroadcast();
  setInterval(() => {
    void refreshAndBroadcast();
  }, REFRESH_MS);

  await app.listen({ host: '0.0.0.0', port: API_PORT });
  app.log.info(
    {
      port: API_PORT,
      refreshMs: REFRESH_MS,
      dataDir: resolveDataDir(),
      referenceDayOffsetDays: CC_REFERENCE_DAY_OFFSET_DAYS,
    },
    'CC API em execução.'
  );
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
