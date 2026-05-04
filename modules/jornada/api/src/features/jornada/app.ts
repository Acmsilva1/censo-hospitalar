import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { getApiPort, getDadosDir } from '../../core/paths';
import { getSqlDataSource } from '../../core/sqlDataSource';
import { isInternacaoOutcome } from './internacaoOutcome';

const fastify = Fastify({ logger: true });

fastify.register(cors);
fastify.register(websocket);

const DADOS_DIR = getDadosDir();
const dataSource = getSqlDataSource();

/** DuckDB pode devolver `bigint`; JSON do Fastify nao serializa BigInt. */
const rowFromDuck = (row: Record<string, unknown>) => {
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
};

// Estruturas de dados em RAM
let globalAttendances: any[] = [];
let labData = new Map<string, any[]>();
let medData = new Map<string, any[]>();
let viasData = new Map<string, string[]>();
let imagingData = new Map<string, any[]>(); // RX, ECG, TC, US
let revalData = new Map<string, any[]>();
let metas: any[] = [];
/** Linhas farmácia (pendentes + liberadas) — coluna PADRAO para medicação fora do padrão. */
type FarmMedLinha = { nrAtendimento: string; dtRef?: string; medicamento: string; padrao: string };
/** Índice por chaves de NR (mesma lógica que labs/med) — lookup O(linhas do atendimento), não O(tabela inteira). */
let farmMedByKey = new Map<string, FarmMedLinha[]>();
let farmMedRowCount = 0;

/** Metadados da carga em segundo plano (jornada completa depende disto). */
let auxiliaryReady = false;
let auxiliaryLoadError: string | null = null;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3020';

const publishOrchestratorEvent = async (event: Record<string, unknown>) => {
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      fastify.log.warn({ status: res.status }, 'Falha ao publicar evento no orquestrador.');
    }
  } catch (err) {
    fastify.log.warn({ err }, 'Orquestrador indisponivel para publicacao de evento.');
  }
};

const loadParquet = async (filename: string): Promise<any[]> => {
  const table = filename.replace(/\.parquet$/i, '');
  const rows = await dataSource.query<Record<string, unknown>>(`SELECT * FROM ${table}`);
  return rows.map(rowFromDuck);
};

/**
 * Agrega vias no DuckDB (evita `SELECT *` de dezenas de MB só para deduplicar em Node).
 */
const loadViasAggregated = async (): Promise<void> => {
  const rows = await dataSource.query<Record<string, unknown>>(`
    SELECT NR_ATENDIMENTO, array_agg(DS_MATERIAL ORDER BY DS_MATERIAL) AS materiais
    FROM (
      SELECT DISTINCT NR_ATENDIMENTO, DS_MATERIAL
      FROM tbl_vias_medicamentos
      WHERE DS_MATERIAL IS NOT NULL
    ) t
    GROUP BY NR_ATENDIMENTO
  `);
  for (const row of rows || []) {
    const key = String(row.NR_ATENDIMENTO);
    const raw = row.materiais;
    const list: string[] = Array.isArray(raw) ? raw.map(String) : raw != null ? [String(raw)] : [];
    viasData.set(key, list);
  }
};

/** DuckDB faz as leituras Parquet; Node só orquestra Promises e preenche Maps (em paralelo onde seguro). */
const loadAuxiliaryTables = async () => {
  const t0 = Date.now();
  auxiliaryReady = false;
  auxiliaryLoadError = null;
  try {
    fastify.log.info('Carga auxiliar: leituras sequenciais no DuckDB para evitar conflito de conexao.');

    const labs = await loadParquet('tbl_tempos_laboratorio.parquet');
    const meds = await loadParquet('tbl_tempos_medicacao.parquet');
    const rx = await loadParquet('tbl_tempos_rx_e_ecg.parquet');
    const tc = await loadParquet('tbl_tempos_tc_e_us.parquet');
    const revals = await loadParquet('tbl_tempos_reavaliacao.parquet');
    const metasRows = await loadParquet('meta_tempos.parquet');
    await loadViasAggregated();

    farmMedByKey = new Map();
    farmMedRowCount = 0;
    const indexFarmRow = (f: FarmMedLinha) => {
      farmMedRowCount += 1;
      for (const k of candidateKeysForAtendimento(f.nrAtendimento)) {
        if (!k) continue;
        const list = farmMedByKey.get(k) || [];
        list.push(f);
        farmMedByKey.set(k, list);
      }
    };
    const pushFarm = (rows: any[], dtFieldPendente: 'DT_ADMIN' | 'DT_LIBERACAO') => {
      for (const row of rows) {
        const r = row as Record<string, unknown>;
        const dtRef =
          dtFieldPendente === 'DT_ADMIN'
            ? (r.DT_ADMIN ?? r.DT_LIBERACAO)
            : (r.DT_LIBERACAO ?? r.DT_ADMIN);
        const p = String(r.PADRAO ?? '')
          .trim()
          .toUpperCase();
        const f: FarmMedLinha = {
          nrAtendimento: String(r.NR_ATENDIMENTO ?? ''),
          dtRef: dtRef != null && String(dtRef).trim() !== '' ? String(dtRef) : undefined,
          medicamento: String(r.MEDICAMENTO ?? '').trim(),
          padrao: p === 'S' || p === 'N' ? p : '',
        };
        indexFarmRow(f);
      }
    };
    try {
      pushFarm(await loadParquet('tbl_farm_relatorio_pendentes_base.parquet'), 'DT_ADMIN');
    } catch {
      fastify.log.warn('tbl_farm_relatorio_pendentes_base.parquet indisponivel ou vazio.');
    }
    try {
      pushFarm(await loadParquet('tbl_farm_relatorio_liberadas_base.parquet'), 'DT_LIBERACAO');
    } catch {
      fastify.log.warn('tbl_farm_relatorio_liberadas_base.parquet indisponivel ou vazio.');
    }

    labs.forEach((l) => {
      const list = labData.get(String(l.NR_ATENDIMENTO)) || [];
      list.push(l);
      labData.set(String(l.NR_ATENDIMENTO), list);
    });

    meds.forEach((m) => {
      const list = medData.get(String(m.NR_ATENDIMENTO)) || [];
      list.push(m);
      medData.set(String(m.NR_ATENDIMENTO), list);
    });

    [...rx, ...tc].forEach((i) => {
      const list = imagingData.get(String(i.NR_ATENDIMENTO)) || [];
      list.push(i);
      imagingData.set(String(i.NR_ATENDIMENTO), list);
    });

    revals.forEach((r) => {
      const list = revalData.get(String(r.NR_ATENDIMENTO)) || [];
      list.push(r);
      revalData.set(String(r.NR_ATENDIMENTO), list);
    });

    metas = metasRows;
    auxiliaryReady = true;
    fastify.log.info(
      {
        ms: Date.now() - t0,
        metas: metas.length,
        viasKeys: viasData.size,
        farmMedLinhas: farmMedRowCount,
        farmMedChaves: farmMedByKey.size,
      },
      'Carga auxiliar concluída.'
    );
  } catch (e) {
    auxiliaryLoadError = e instanceof Error ? e.message : String(e);
    fastify.log.error(e, 'Falha na carga auxiliar');
    auxiliaryReady = false;
  }
};

export const start = async () => {
  try {
    await dataSource.initialize(DADOS_DIR);
    fastify.log.info(`DataSource ativo: ${dataSource.sourceName()}; pasta: ${DADOS_DIR}`);

    globalAttendances = await loadParquet('tbl_tempos_entrada_consulta_saida.parquet');
    fastify.log.info(`${globalAttendances.length} atendimentos na tabela principal.`);

    const port = getApiPort();
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`HTTP na porta ${port} — /api/units e /api/patients já podem responder; auxiliar em segundo plano.`);

    void loadAuxiliaryTables();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

/** Normaliza token de atendimento (trim, bigint/string, "975605.0" → "975605"). */
function normalizeAtendimentoToken(v: unknown): string {
  if (v == null || v === '') return '';
  let s = String(v).trim();
  if (/^\d+\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && Number.isSafeInteger(Math.trunc(n))) s = String(Math.trunc(n));
  }
  return s;
}

/** Compara IDs de atendimento vindos de Parquet/ERP (string vs número vs sufixo .0). */
function idsEquivalent(stored: unknown, requested: string): boolean {
  const a = normalizeAtendimentoToken(stored);
  const b = normalizeAtendimentoToken(requested);
  if (!a || !b) return false;
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && !Number.isNaN(nb) && na === nb;
}

/**
 * Localiza a linha do PS para montar a jornada:
 * 1) NR_ATENDIMENTO (episódio único ou número que o Censo também mostra)
 * 2) NR_ATENDIMENTO_INT — quando o leito/internação usa o vínculo de internação e o PS mantém outro NR na mesma linha
 */
function findAttendanceForJourney(searchId: string): any | undefined {
  const sid = searchId.trim();
  const byPs = globalAttendances.find((a) => idsEquivalent(a.NR_ATENDIMENTO, sid));
  if (byPs) return byPs;

  const intMatches = globalAttendances.filter((a) => idsEquivalent(a.NR_ATENDIMENTO_INT, sid));
  if (intMatches.length === 0) return undefined;
  if (intMatches.length === 1) return intMatches[0];
  return intMatches.sort(
    (x, y) => new Date(y.DT_ENTRADA || 0).getTime() - new Date(x.DT_ENTRADA || 0).getTime()
  )[0];
}

function candidateKeysForAtendimento(psNrAtendimento: unknown): string[] {
  const raw = String(psNrAtendimento ?? '').trim();
  const norm = normalizeAtendimentoToken(psNrAtendimento);
  const out = new Set<string>();
  if (raw) out.add(raw);
  if (norm) out.add(norm);
  const n = Number(norm || raw);
  if (!Number.isNaN(n)) out.add(String(n));
  return [...out];
}

function getAuxiliaryRows<T>(map: Map<string, T[]>, psNrAtendimento: unknown): T[] {
  for (const k of candidateKeysForAtendimento(psNrAtendimento)) {
    const hit = map.get(k);
    if (hit && hit.length > 0) return hit;
  }
  const n = Number(normalizeAtendimentoToken(psNrAtendimento));
  if (!Number.isNaN(n)) {
    for (const mk of map.keys()) {
      if (Number(mk) === n) {
        const hit = map.get(mk);
        if (hit && hit.length > 0) return hit;
      }
    }
  }
  return [];
}

function getViasForAtendimento(psNrAtendimento: unknown): string[] {
  for (const k of candidateKeysForAtendimento(psNrAtendimento)) {
    const v = viasData.get(k);
    if (v && v.length > 0) return v;
  }
  const n = Number(normalizeAtendimentoToken(psNrAtendimento));
  if (!Number.isNaN(n)) {
    for (const mk of viasData.keys()) {
      if (Number(mk) === n) {
        const v = viasData.get(mk);
        if (v && v.length > 0) return v;
      }
    }
  }
  return [];
}

/**
 * Labs/med/imagem/reaval — Parquets às vezes usam o NR do PS, às vezes o mesmo número
 * pedido na URL (internação) ou NR_ATENDIMENTO_INT; tentamos nessa ordem.
 */
function getAuxiliaryRowsForJourney(map: Map<string, any[]>, match: any, requestedSearchId: string): any[] {
  const psKey = normalizeAtendimentoToken(match.NR_ATENDIMENTO) || String(match.NR_ATENDIMENTO ?? '').trim();
  let rows = getAuxiliaryRows(map, psKey);
  if (rows.length > 0) return rows;
  rows = getAuxiliaryRows(map, requestedSearchId);
  if (rows.length > 0) return rows;
  const intK = normalizeAtendimentoToken(match.NR_ATENDIMENTO_INT);
  if (intK) rows = getAuxiliaryRows(map, intK);
  return rows;
}

function getViasForJourney(match: any, requestedSearchId: string): string[] {
  const psKey = normalizeAtendimentoToken(match.NR_ATENDIMENTO) || String(match.NR_ATENDIMENTO ?? '').trim();
  let v = getViasForAtendimento(psKey);
  if (v.length > 0) return v;
  v = getViasForAtendimento(requestedSearchId);
  if (v.length > 0) return v;
  const intK = normalizeAtendimentoToken(match.NR_ATENDIMENTO_INT);
  return intK ? getViasForAtendimento(intK) : [];
}

/** Descrição legível — exports Tasy variam colunas (DS_*, NM_*). */
function pickLabel(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

function toEpochMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

function normMedNome(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junta linhas da farm indexadas por qualquer chave de NR candidata (evita duplicar o mesmo objeto). */
function farmRowsForNrs(nrSet: Set<string>): FarmMedLinha[] {
  const dedupe = new Map<string, FarmMedLinha>();
  for (const c of nrSet) {
    for (const k of candidateKeysForAtendimento(c)) {
      const list = farmMedByKey.get(k);
      if (!list) continue;
      for (const f of list) {
        const id = `${f.nrAtendimento}\0${f.dtRef ?? ''}\0${f.medicamento}\0${f.padrao}`;
        dedupe.set(id, f);
      }
    }
  }
  return [...dedupe.values()];
}

/**
 * Cruza farm (PADRAO) com linha de tbl_tempos_medicacao: NR + janela temporal + nome.
 * Com muitos dados na farm, só percorre linhas do atendimento (mapa por NR).
 * Se houver match forte por nome e alguma linha for N, devolve N (destaque no cliente).
 */
function resolveFarmPadrao(match: any, searchId: string, medRow: any, medNomeResolvido: string): string | undefined {
  if (farmMedByKey.size === 0) return undefined;
  const dtMed = toEpochMs(medRow?.DT_ADMINISTRACAO ?? medRow?.DT_PRESCRICAO);
  if (dtMed == null) return undefined;

  const nrSet = new Set<string>();
  for (const k of candidateKeysForAtendimento(match?.NR_ATENDIMENTO)) {
    const n = normalizeAtendimentoToken(k);
    if (n) nrSet.add(n);
  }
  for (const k of candidateKeysForAtendimento(match?.NR_ATENDIMENTO_INT)) {
    const n = normalizeAtendimentoToken(k);
    if (n) nrSet.add(n);
  }
  const sid = normalizeAtendimentoToken(searchId);
  if (sid) nrSet.add(sid);

  const pool = farmRowsForNrs(nrSet);
  if (pool.length === 0) return undefined;

  const nomeLinha = normMedNome(medNomeResolvido);
  const WINDOW_MS = 25 * 60 * 1000;

  type Cand = { f: FarmMedLinha; diff: number; nameMatch: boolean };
  const cands: Cand[] = [];
  for (const f of pool) {
    if (!f.padrao) continue;
    const nrF = normalizeAtendimentoToken(f.nrAtendimento);
    const hitNr = [...nrSet].some((c) => c && idsEquivalent(nrF, c));
    if (!hitNr) continue;

    const dtF = toEpochMs(f.dtRef);
    if (dtF == null) continue;
    const diff = Math.abs(dtF - dtMed);
    if (diff > WINDOW_MS) continue;

    const fn = normMedNome(f.medicamento);
    const nameMatch =
      nomeLinha.length >= 3 &&
      fn.length >= 3 &&
      (fn.includes(nomeLinha) || nomeLinha.includes(fn) || fn === nomeLinha);
    cands.push({ f, diff, nameMatch });
  }
  if (cands.length === 0) return undefined;

  const strict = cands.filter((c) => c.nameMatch);
  if (strict.length > 0) {
    if (strict.some((c) => c.f.padrao === 'N')) return 'N';
    strict.sort((a, b) => a.diff - b.diff);
    const p = strict[0].f.padrao;
    return p === 'S' || p === 'N' ? p : undefined;
  }

  cands.sort((a, b) => {
    const sa = a.nameMatch ? a.diff : a.diff + 36 * 60 * 60 * 1000;
    const sb = b.nameMatch ? b.diff : b.diff + 36 * 60 * 60 * 1000;
    return sa - sb;
  });
  const best = cands[0];
  const near = cands.filter((c) => c.diff <= best.diff + 3 * 60 * 1000);
  if (near.some((c) => c.f.padrao === 'N')) return 'N';
  const p = best.f.padrao;
  return p === 'S' || p === 'N' ? p : undefined;
}

// --- ENDPOINTS ---

fastify.get('/api/health', async () => ({
  ok: true,
  dadosDir: DADOS_DIR,
  mainRows: globalAttendances.length,
  auxiliaryReady,
  auxiliaryError: auxiliaryLoadError,
}));

// Unidades únicas
fastify.get('/api/units', async () => {
  return [...new Set(globalAttendances.map(a => a.UNIDADE).filter(Boolean))].sort();
});

fastify.get('/api/metas', async () => {
  return metas;
});

fastify.post<{ Body: { atendimentoId: string; pacienteId: string; payload?: Record<string, unknown> } }>(
  '/api/integration/internacao-indicada',
  async (request, reply) => {
    const { atendimentoId, pacienteId, payload } = request.body || ({} as any);
    if (!atendimentoId || !pacienteId) {
      return reply.status(400).send({ error: 'atendimentoId e pacienteId sao obrigatorios' });
    }

    await publishOrchestratorEvent({
      eventId: `j-${atendimentoId}-${pacienteId}-${Date.now()}`,
      version: 1,
      type: 'PS_INTERNACAO_INDICADA',
      timestamp: new Date().toISOString(),
      source: 'jornada',
      atendimentoId: String(atendimentoId),
      pacienteId: String(pacienteId),
      payload: payload || {},
    });

    return { ok: true };
  }
);

// Pacientes por unidade
fastify.get<{ Querystring: { unit?: string } }>('/api/patients', async (request, reply) => {
  const { unit } = request.query;
  if (!unit) return reply.status(400).send({ error: 'unit obrigatório' });

  const filtered = globalAttendances.filter(a => a.UNIDADE === unit);
  const byPatient = new Map<string, any>();
  for (const a of filtered) {
    const key = String(a.CD_PESSOA_FISICA);
    const existing = byPatient.get(key);
    if (!existing || new Date(a.DT_ENTRADA) > new Date(existing.DT_ENTRADA)) {
      byPatient.set(key, a);
    }
  }

  return [...byPatient.values()]
    .filter(a => a.NR_ATENDIMENTO && String(a.NR_ATENDIMENTO).trim() !== '')
    .sort((a, b) => new Date(b.DT_ENTRADA).getTime() - new Date(a.DT_ENTRADA).getTime())
    .slice(0, 200)
    .map(a => {
      /** Calculado na API com a linha completa do Parquet — a fila não depende de campos opcionais omitidos no JSON. */
      const outcomeInternacao = isInternacaoOutcome(a as Record<string, unknown>);
      return {
        NR_ATENDIMENTO: String(a.NR_ATENDIMENTO),
        PACIENTE: a.PACIENTE,
        IDADE: a.IDADE,
        SEXO: a.SEXO,
        PRIORIDADE: a.PRIORIDADE,
        DT_ENTRADA: a.DT_ENTRADA,
        DT_ALTA: a.DT_ALTA,
        DT_DESFECHO: a.DT_DESFECHO,
        DESFECHO: a.DESFECHO,
        DS_TIPO_ALTA: a.DS_TIPO_ALTA,
        DESTINO: a.DESTINO,
        DT_INTERNACAO: a.DT_INTERNACAO,
        NR_ATENDIMENTO_INT: a.NR_ATENDIMENTO_INT,
        CID_INTERNADO: a.CID_INTERNADO,
        ALTA_HOSPITALAR: a.ALTA_HOSPITALAR,
        ALTA_MEDICA: a.ALTA_MEDICA,
        CD_PESSOA_FISICA: String(a.CD_PESSOA_FISICA),
        outcomeInternacao,
      };
    });
});

// Detalhe da Jornada - O CORAÇÃO DO MAPA DO MAROTO
// Usando * em vez de :id para garantir que caracteres especiais não quebrem o router do Fastify
fastify.get<{ Params: { '*': string } }>('/api/journey/*', async (request, reply) => {
  const idStr = request.params['*'];
  if (!idStr) return reply.status(400).send({ error: 'ID vazio' });
  
  const searchId = decodeURIComponent(idStr).trim();
  const match = findAttendanceForJourney(searchId);
  if (!match) {
    return reply.status(404).send({ error: `Atendimento [${searchId}] não encontrado` });
  }

  const steps: any[] = [];
  const toMin = (val: any) => (val && !isNaN(Number(val)) ? Number(val) : null);
  const diffInMin = (t1: string, t2: string) => {
    if (!t1 || !t2) return null;
    return Math.round((new Date(t2).getTime() - new Date(t1).getTime()) / 60000);
  };

  // 1. Fluxo Base (ZONA INICIAL)
  steps.push({ type: 'FLOW', step: 'ENTRADA', label: 'Chegada / Senha', time: match.DT_ENTRADA, endTime: match.DT_TRIAGEM, minutes: 0 });
  
  if (match.DT_TRIAGEM) {
    steps.push({ 
      type: 'FLOW', 
      step: 'TRIAGEM', 
      label: 'Triagem', 
      time: match.DT_TRIAGEM, 
      endTime: match.DT_FIM_TRIAGEM, 
      minutes: toMin(match.MIN_ENTRADA_X_TRIAGEM),
      detail: { priority: match.PRIORIDADE }
    });
  }
  if (match.DT_ATEND_MEDICO) {
    steps.push({ 
      type: 'FLOW', 
      step: 'CONSULTA', 
      label: 'Consulta Médica', 
      time: match.DT_ATEND_MEDICO, 
      endTime: match.DT_DESFECHO, 
      minutes: toMin(match.MIN_ENTRADA_X_CONSULTA),
      detail: { 
        specialty: match.DS_ESPECIALID,
        doctor: match.MEDICO_ATENDIMENTO,
        room: match.LOCALIZACAO_PAC,
        cid: match.CD_CID
      }
    });
  }

  // 2. Ramificações (ZONA DE AÇÃO)
  const labs = getAuxiliaryRowsForJourney(labData, match, searchId);
  if (labs.length > 0) {
    const sorted = labs.sort((a, b) => new Date(a.DT_SOLICITACAO).getTime() - new Date(b.DT_SOLICITACAO).getTime());
    const sortedExames = labs.map(l => l).sort((a, b) => new Date(a.DT_EXAME).getTime() - new Date(b.DT_EXAME).getTime());
    steps.push({ 
      type: 'ACTION', 
      step: 'LABORATORIO', 
      label: 'Laboratório', 
      time: sorted[0].DT_SOLICITACAO, 
      endTime: sortedExames[sortedExames.length - 1].DT_EXAME,
      minutes: diffInMin(sorted[0].DT_SOLICITACAO, sortedExames[sortedExames.length - 1].DT_EXAME),
      count: labs.length, 
      detail: labs.map((l) => {
        const r = l as Record<string, unknown>;
        const name =
          pickLabel(r, [
            'DS_PROC_EXAME',
            'DS_EXAME',
            'NM_EXAME',
            'DS_PROCEDIMENTO',
            'PROCEDIMENTO',
            'DS_PROC_EXAME_COMP',
            'EXAME',
          ]) || 'Exame (sem descrição no extract)';
        const timeRaw = (l as { DT_SOLICITACAO?: string; DT_EXAME?: string }).DT_SOLICITACAO || (l as { DT_EXAME?: string }).DT_EXAME;
        return { name, time: timeRaw, status: 'Coletado' };
      }),
    });
  }

  const images = getAuxiliaryRowsForJourney(imagingData, match, searchId);
  if (images.length > 0) {
    const sorted = images.sort((a, b) => new Date(a.DT_SOLICITACAO).getTime() - new Date(b.DT_SOLICITACAO).getTime());
    const sortedExames = images.map(i => i).sort((a, b) => new Date(a.DT_EXAME).getTime() - new Date(b.DT_EXAME).getTime());
    steps.push({ 
      type: 'ACTION', 
      step: 'IMAGEM', 
      label: 'RX / TC / US', 
      time: sorted[0].DT_SOLICITACAO, 
      endTime: sortedExames[sortedExames.length - 1].DT_EXAME,
      minutes: diffInMin(sorted[0].DT_SOLICITACAO, sortedExames[sortedExames.length - 1].DT_EXAME),
      count: images.length, 
      detail: images.map((i) => {
        const r = i as Record<string, unknown>;
        const name =
          pickLabel(r, [
            'EXAME',
            'DS_EXAME',
            'NM_EXAME',
            'DS_PROC_EXAME',
            'DS_PROCEDIMENTO',
            'DS',
          ]) || 'Exame de imagem (sem descrição no extract)';
        const ti = i as { DT_SOLICITACAO?: string; DT_EXAME?: string; STATUS?: string };
        const timeRaw = ti.DT_SOLICITACAO || ti.DT_EXAME;
        return { name, time: timeRaw, status: ti.STATUS || 'Realizado' };
      }),
    });
  }

  const meds = getAuxiliaryRowsForJourney(medData, match, searchId);
  if (meds.length > 0) {
    const sorted = meds.sort((a, b) => new Date(a.DT_PRESCRICAO).getTime() - new Date(b.DT_PRESCRICAO).getTime());
    const sortedAdmin = meds.map(m => m).sort((a, b) => new Date(a.DT_ADMINISTRACAO).getTime() - new Date(b.DT_ADMINISTRACAO).getTime());
    const materials = getViasForJourney(match, searchId);
    
    steps.push({ 
      type: 'ACTION', 
      step: 'MEDICACAO', 
      label: 'Medicação', 
      time: sorted[0].DT_PRESCRICAO, 
      endTime: sortedAdmin[sortedAdmin.length - 1].DT_ADMINISTRACAO,
      minutes: diffInMin(sorted[0].DT_PRESCRICAO, sortedAdmin[sortedAdmin.length - 1].DT_ADMINISTRACAO),
      count: meds.length, 
      detail: sorted.map((m, idx) => {
        const r = m as Record<string, unknown>;
        let name = pickLabel(r, [
          'DS_MEDICAMENTO',
          'DS_PRODUTO',
          'DS_ITEM',
          'NM_MEDICAMENTO',
          'DS_MATERIAL',
          'MEDICAMENTO',
          'PRODUTO',
          'DS',
          'ITEM',
        ]);
        if (!name) name = materials[idx] || '';
        if (!name) name = pickLabel(r, ['OBSERVACAO', 'DS_OBSERVACAO', 'COMPLEMENTO']) || '';
        if (!name) name = materials[0] || '';
        if (!name) name = 'Medicação (sem descrição no extract)';
        const mt = m as { DT_ADMINISTRACAO?: string; DT_PRESCRICAO?: string };
        const timeRaw = mt.DT_ADMINISTRACAO || mt.DT_PRESCRICAO;
        const padraoFarm = resolveFarmPadrao(match, searchId, m, name);
        const row: Record<string, unknown> = { name, time: timeRaw, status: 'Checado' };
        if (padraoFarm === 'S' || padraoFarm === 'N') row.padrao = padraoFarm;
        return row;
      }),
    });
  }

  // 3. Fechamento (ZONA DE FINALIZAÇÃO)
  const revals = getAuxiliaryRowsForJourney(revalData, match, searchId);
  if (revals.length > 0) {
    const sorted = revals.sort((a, b) => new Date(a.DT_SOLIC_REAVALIACAO).getTime() - new Date(b.DT_SOLIC_REAVALIACAO).getTime());
    steps.push({ 
      type: 'FLOW', 
      step: 'REAVALIACAO', 
      label: 'Reavaliação', 
      time: sorted[0].DT_SOLIC_REAVALIACAO, 
      minutes: diffInMin(sorted[0].DT_SOLIC_REAVALIACAO, sorted[sorted.length - 1].DT_SOLIC_REAVALIACAO) || 30, // Fallback se só tiver uma reaval
      count: revals.length,
      detail: revals.map(r => ({ name: `Reavaliação por ${r.MEDICO || 'Médico'}`, time: r.DT_SOLIC_REAVALIACAO }))
    });
  }

  if (match.DT_DESFECHO) {
    const isIntern = isInternacaoOutcome(match as Record<string, unknown>);
    steps.push({ 
      type: 'OUTCOME', 
      step: isIntern ? 'INTERNACAO' : 'ALTA', 
      label: isIntern ? 'Internação' : 'Alta Médica', 
      time: match.DT_DESFECHO, 
      endTime: match.DT_ALTA,
      // Cálculo real de permanência: Saída - Entrada Portaria
      minutes: diffInMin(match.DT_ENTRADA, match.DT_DESFECHO),
      detail: match.DESFECHO
    });
  }

  // 4. Acoplagem de Metas (Inteligência de SLA)
  const findMeta = (key: string) => metas.find(m => m.CHAVE === key);
  
  steps.forEach(s => {
    let metaKey = '';
    if (s.step === 'TRIAGEM') metaKey = 'TRIAGEM_MIN';
    if (s.step === 'CONSULTA') metaKey = 'CONSULTA_MIN';
    if (s.step === 'MEDICACAO') metaKey = 'MEDICACAO_MIN';
    if (s.step === 'REAVALIACAO') metaKey = 'REAVALIACAO_MIN';
    if (s.step === 'ALTA') metaKey = 'PERMANENCIA_MIN';
    if (s.step === 'LABORATORIO') metaKey = 'PROCEDIMENTO_MIN';
    if (s.step === 'IMAGEM') {
      const hasTC = s.detail?.some((d: any) => d.name?.includes('TC') || d.name?.includes('US'));
      metaKey = hasTC ? 'TC_US_MIN' : 'RX_ECG_MIN';
    }

    if (metaKey) {
      const m = findMeta(metaKey);
      if (m) {
        s.slaLimit = Number(m.VALOR_MIN);
        s.slaAlert = Number(m.ALERTA_MIN);
      }
    }
  });

  return {
    ...match,
    steps: steps.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
  };
});

// Endpoint de Métricas Gerenciais
fastify.get('/api/gerencia/metrics', async (request, reply) => {
  const units = [...new Set(globalAttendances.map(a => a.UNIDADE).filter(Boolean))];
  
  const metrics = units.map(u => {
    const unitData = globalAttendances.filter(a => a.UNIDADE === u);
    const total = unitData.length;
    const altas = unitData.filter(a => !a.DESFECHO?.toLowerCase().includes('intern')).length;
    const interns = total - altas;
    
    const avgTime = unitData.reduce((acc, a) => acc + (Number(a.MIN_ENTRADA_X_ALTA) || 0), 0) / (total || 1);

    return {
      unidade: u,
      total,
      altas,
      interns,
      avgTime: Math.round(avgTime),
      taxaConversao: Math.round((interns / (total || 1)) * 100)
    };
  });

  return metrics;
});

// WebSocket Journey
fastify.register(async function (fastify) {
  fastify.get('/ws/journey/:id', { websocket: true }, (socket, req) => {
    const urlParts = req.url.split('/');
    const id = urlParts[urlParts.length - 1];
    
    // Simplificado para fins de demonstração visual
    let step = 0;
    const interval = setInterval(() => {
      // O frontend agora usa o polling da jornada completa, mas o WS pode triggerar animações
      socket.send(JSON.stringify({ type: 'TICK', step }));
      step++;
      if (step > 10) clearInterval(interval);
    }, 2000);

    socket.on('close', () => clearInterval(interval));
  });
});

/** Instância Fastify (para testes com `inject` sem abrir porta). */
export { fastify };
