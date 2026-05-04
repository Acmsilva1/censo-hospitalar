/**
 * Teste de carga do censo: HTTP /api/hospitals + Socket.IO join-hospital.
 *
 * Uso (API a correr, ex. porta 3212):
 *   cd modules/censo/api
 *   CENSO_URL=http://localhost:3212 HOSPITAL="ES - HOSPITAL VITORIA" CONNECTIONS=60 npm run load-test
 *
 * Variáveis:
 *   CENSO_URL      — base URL (default http://localhost:3212)
 *   HOSPITAL       — nome passado a join-hospital
 *   CONNECTIONS    — sockets em paralelo (default 40)
 *   HTTP_REQUESTS  — GET /api/hospitals em paralelo (default 200)
 */

import { io as ClientIO, type Socket } from 'socket.io-client';

const CENSO_URL = (process.env.CENSO_URL || 'http://localhost:3212').replace(/\/$/, '');
const HOSPITAL = process.env.HOSPITAL || 'ES - HOSPITAL VITORIA';
const CONNECTIONS = Math.max(1, parseInt(process.env.CONNECTIONS || '40', 10));
const HTTP_REQUESTS = Math.max(1, parseInt(process.env.HTTP_REQUESTS || '200', 10));
const SOCKET_TIMEOUT_MS = Math.max(5000, parseInt(process.env.SOCKET_TIMEOUT_MS || '20000', 10));

type SocketRow = {
  id: number;
  connectMs: number | null;
  initialStateMs: number | null;
  error?: string;
};

function runSocketClient(id: number): Promise<SocketRow> {
  const t0 = Date.now();
  const row: SocketRow = { id, connectMs: null, initialStateMs: null };

  return new Promise((resolve) => {
    let settled = false;
    const done = (patch: Partial<SocketRow>) => {
      if (settled) return;
      settled = true;
      Object.assign(row, patch);
      resolve(row);
    };

    const socket: Socket = ClientIO(CENSO_URL, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 12000,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      done({ error: 'timeout censo-initial-state', initialStateMs: Date.now() - t0 });
    }, SOCKET_TIMEOUT_MS);

    socket.on('connect', () => {
      row.connectMs = Date.now() - t0;
      const t1 = Date.now();
      socket.once('censo-initial-state', () => {
        clearTimeout(timer);
        row.initialStateMs = Date.now() - t1;
        socket.disconnect();
        done({});
      });
      socket.once('censo-error', () => {
        clearTimeout(timer);
        row.initialStateMs = Date.now() - t1;
        row.error = 'censo-error';
        socket.disconnect();
        done({});
      });
      socket.emit('join-hospital', HOSPITAL);
    });

    socket.on('connect_error', (err: Error) => {
      clearTimeout(timer);
      socket.disconnect();
      done({ error: err.message || 'connect_error' });
    });
  });
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

async function httpBurst(): Promise<{ ok: number; fail: number; ms: number[] }> {
  const url = `${CENSO_URL}/api/hospitals`;
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: HTTP_REQUESTS }, async () => {
      const t = Date.now();
      try {
        const r = await fetch(url, { method: 'GET' });
        const ok = r.ok;
        return { ok, ms: Date.now() - t };
      } catch {
        return { ok: false, ms: Date.now() - t };
      }
    })
  );
  const ok = results.filter((x) => x.ok).length;
  const ms = results.filter((x) => x.ok).map((x) => x.ms);
  ms.sort((a, b) => a - b);
  console.log(
    `[HTTP] GET /api/hospitals x${HTTP_REQUESTS} em ${Date.now() - t0}ms total | ok=${ok} fail=${HTTP_REQUESTS - ok}`
  );
  if (ms.length) {
    console.log(
      `       latência ms: min=${ms[0]} p50=${percentile(ms, 0.5)} p95=${percentile(ms, 0.95)} max=${ms[ms.length - 1]}`
    );
  }
  return { ok, fail: HTTP_REQUESTS - ok, ms };
}

async function main() {
  console.log(`\n=== Teste de carga censo ===`);
  console.log(`URL=${CENSO_URL} hospital="${HOSPITAL}" sockets=${CONNECTIONS} http=${HTTP_REQUESTS}\n`);

  await httpBurst();

  console.log(`\n[Sockets] abrindo ${CONNECTIONS} conexões em paralelo…`);
  const t0 = Date.now();
  const rows = await Promise.all(Array.from({ length: CONNECTIONS }, (_, i) => runSocketClient(i)));
  const wall = Date.now() - t0;

  const withState = rows.filter((r) => r.initialStateMs != null && !r.error);
  const errors = rows.filter((r) => r.error);

  const lat = rows
    .map((r) => r.initialStateMs)
    .filter((x): x is number => typeof x === 'number' && !Number.isNaN(x));
  lat.sort((a, b) => a - b);

  console.log(`\n[Sockets] wall-clock ${wall}ms`);
  console.log(`          sucesso censo-initial-state: ${withState.length}/${CONNECTIONS} erros=${errors.length}`);

  if (lat.length) {
    console.log(
      `          latência initial-state (ms): min=${lat[0]} p50=${percentile(lat, 0.5)} p95=${percentile(lat, 0.95)} max=${lat[lat.length - 1]}`
    );
  }

  const connectLat = rows.map((r) => r.connectMs).filter((x): x is number => x != null) as number[];
  connectLat.sort((a, b) => a - b);
  if (connectLat.length) {
    console.log(
      `          connect (ms): min=${connectLat[0]} p50=${percentile(connectLat, 0.5)} p95=${percentile(connectLat, 0.95)} max=${connectLat[connectLat.length - 1]}`
    );
  }

  errors.slice(0, 15).forEach((e) => console.log(`          erro id=${e.id}: ${e.error}`));

  const badRate = errors.length / CONNECTIONS;
  if (badRate > 0.15) {
    console.log('\n⚠ Muitas falhas — confirme se a API censo está a correr (npm run dev na pasta modules/censo/api).');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
