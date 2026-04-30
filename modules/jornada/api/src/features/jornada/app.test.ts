import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from './app';

describe('API Jornada (Fastify inject)', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('GET /api/health — 200 e shape mínimo', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      dadosDir: string;
      mainRows: number;
      auxiliaryReady: boolean;
    };
    expect(body.ok).toBe(true);
    expect(typeof body.dadosDir).toBe('string');
    expect(typeof body.mainRows).toBe('number');
    expect(typeof body.auxiliaryReady).toBe('boolean');
  });

  it('GET /api/patients sem unit — 400', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/patients' });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toMatch(/unit/i);
  });

  it('GET /api/units — 200 e array', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/api/units' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });
});
