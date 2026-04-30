import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

type EventType =
  | 'PS_INTERNACAO_INDICADA'
  | 'LEITO_RESERVADO'
  | 'LEITO_OCUPADO'
  | 'RESERVA_CANCELADA'
  | 'RESERVA_EXPIRADA';

type OrchestratorEvent = {
  eventId: string;
  version: 1;
  type: EventType;
  timestamp: string;
  source: 'jornada' | 'censo';
  atendimentoId: string;
  pacienteId: string;
  payload?: Record<string, unknown>;
};

type CorrelationState = {
  atendimentoId: string;
  pacienteId: string;
  internacaoIndicadaAt?: string;
  leitoStatus?: 'RESERVADO' | 'OCUPADO' | 'CANCELADO' | 'EXPIRADO';
  leitoId?: string;
  /**
   * PS já sinalizou internação; ainda não há leito vinculado no centro
   * (ou a reserva foi cancelada/expirou e o paciente volta à fila lógica).
   */
  limboAguardandoLeito: boolean;
  updatedAt: string;
};

const app = Fastify({ logger: true });
app.register(cors);
app.register(websocket);

const targets = {
  jornadaApi: process.env.JORNADA_API_URL || 'http://localhost:3211',
  censoApi: process.env.CENSO_API_URL || 'http://localhost:3212',
  jornadaWeb: process.env.JORNADA_WEB_URL || 'http://localhost:5276',
  censoWeb: process.env.CENSO_WEB_URL || 'http://localhost:5278',
};

const seenEventIds = new Set<string>();
const states = new Map<string, CorrelationState>();
const sockets = new Set<any>();

function stateKey(atendimentoId: string, pacienteId: string) {
  return `${atendimentoId}::${pacienteId}`;
}

function broadcast(data: unknown) {
  const msg = JSON.stringify(data);
  for (const socket of sockets) {
    try {
      socket.send(msg);
    } catch {
      sockets.delete(socket);
    }
  }
}

function applyEvent(evt: OrchestratorEvent): CorrelationState {
  const key = stateKey(evt.atendimentoId, evt.pacienteId);
  const prev = states.get(key);
  const current: CorrelationState = prev
    ? { ...prev, limboAguardandoLeito: prev.limboAguardandoLeito ?? false }
    : {
        atendimentoId: evt.atendimentoId,
        pacienteId: evt.pacienteId,
        limboAguardandoLeito: false,
        updatedAt: evt.timestamp,
      };

  if (evt.type === 'PS_INTERNACAO_INDICADA') {
    current.internacaoIndicadaAt = evt.timestamp;
    current.limboAguardandoLeito = true;
  }

  if (evt.type === 'LEITO_RESERVADO') {
    current.leitoStatus = 'RESERVADO';
    current.leitoId = String(evt.payload?.leitoId || 'N/A');
    current.limboAguardandoLeito = false;
  }

  if (evt.type === 'LEITO_OCUPADO') {
    current.leitoStatus = 'OCUPADO';
    current.leitoId = String(evt.payload?.leitoId || current.leitoId || 'N/A');
    current.limboAguardandoLeito = false;
  }

  if (evt.type === 'RESERVA_CANCELADA') {
    current.leitoStatus = 'CANCELADO';
    current.limboAguardandoLeito = true;
  }

  if (evt.type === 'RESERVA_EXPIRADA') {
    current.leitoStatus = 'EXPIRADO';
    current.limboAguardandoLeito = true;
  }

  current.updatedAt = evt.timestamp;
  states.set(key, current);
  return current;
}

/** Propaga correlação para o módulo Internação (API Censo): limbo + vínculo ao leito. */
async function notifyCensoIntegration(state: CorrelationState) {
  const url = `${targets.censoApi}/api/integration/orchestrator-sync`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      app.log.warn({ status: res.status, url }, 'Censo não aceitou sync do orquestrador.');
    }
  } catch (err) {
    app.log.warn({ err }, 'Censo API indisponível para sync do orquestrador.');
  }
}

app.post<{ Body: OrchestratorEvent }>('/events', async (req, reply) => {
  const evt = req.body;
  if (!evt || evt.version !== 1 || !evt.eventId || !evt.type || !evt.atendimentoId || !evt.pacienteId || !evt.timestamp) {
    return reply.status(400).send({ error: 'invalid_event' });
  }

  if (seenEventIds.has(evt.eventId)) {
    return { ok: true, duplicate: true };
  }

  seenEventIds.add(evt.eventId);
  const state = applyEvent(evt);
  broadcast({ type: 'STATE_UPDATED', event: evt, state });
  void notifyCensoIntegration(state);

  return { ok: true, duplicate: false, state };
});

app.get('/state', async () => ({
  items: Array.from(states.values()),
  total: states.size,
}));

app.get('/health', async () => ({ ok: true, seenEvents: seenEventIds.size, states: states.size }));
app.get('/targets', async () => ({ targets }));

app.register(async (instance) => {
  instance.get('/ws/state', { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'SNAPSHOT', items: Array.from(states.values()) }));
    socket.on('close', () => sockets.delete(socket));
  });
});

const port = Number(process.env.ORCHESTRATOR_PORT || 3210);
app.listen({ host: '0.0.0.0', port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
