import { useEffect, useMemo, useState } from 'react';

type ClockPayload = {
  now: string;
  lastUpdateAt: string;
  nextUpdateAt: string;
  intervalSeconds: number;
};

const ORCHESTRATOR_URL = (import.meta as any).env?.VITE_ORCHESTRATOR_URL || 'http://localhost:3020';

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function useOrchestratorClock() {
  const [clock, setClock] = useState<ClockPayload | null>(null);
  const [serverNowBaseMs, setServerNowBaseMs] = useState<number | null>(null);
  const [localNowAtSyncMs, setLocalNowAtSyncMs] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setTickMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const res = await fetch(`${ORCHESTRATOR_URL}/sync/clock`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as ClockPayload;
        if (cancelled) return;
        setClock(payload);
        setServerNowBaseMs(toMs(payload.now));
        setLocalNowAtSyncMs(Date.now());
      } catch {
        // mantém último snapshot válido
      } finally {
        if (!cancelled) timeoutId = setTimeout(load, 5000);
      }
    };

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  const adjustedNowMs = useMemo(() => {
    if (serverNowBaseMs == null || localNowAtSyncMs == null) return tickMs;
    return serverNowBaseMs + (tickMs - localNowAtSyncMs);
  }, [serverNowBaseMs, localNowAtSyncMs, tickMs]);

  const nextMs = useMemo(() => toMs(clock?.nextUpdateAt), [clock?.nextUpdateAt]);
  const lastMs = useMemo(() => toMs(clock?.lastUpdateAt), [clock?.lastUpdateAt]);

  const secondsLeft = useMemo(() => {
    if (!nextMs) return null;
    return Math.max(0, Math.floor((nextMs - adjustedNowMs) / 1000));
  }, [nextMs, adjustedNowMs]);

  const timeLeft = useMemo(() => {
    if (secondsLeft == null) return '--:--';
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [secondsLeft]);

  const lastUpdateLabel = useMemo(() => {
    if (!lastMs) return '--:--';
    return new Date(lastMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [lastMs]);

  return {
    timeLeft,
    secondsLeft,
    lastUpdateLabel,
    intervalSeconds: clock?.intervalSeconds ?? 600,
    ready: Boolean(clock),
  };
}

