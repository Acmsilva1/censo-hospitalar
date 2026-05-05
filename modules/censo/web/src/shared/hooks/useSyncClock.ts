import { useEffect, useMemo, useState } from 'react';

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function useSyncClock(nextUpdate: string | null | undefined, lastUpdate: string | null | undefined) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nextMs = useMemo(() => toMs(nextUpdate), [nextUpdate]);
  const lastMs = useMemo(() => toMs(lastUpdate), [lastUpdate]);

  const timeLeft = useMemo(() => {
    if (!nextMs) return '--:--';
    const diff = Math.max(0, nextMs - nowMs);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [nextMs, nowMs]);

  const lastUpdateLabel = useMemo(() => {
    if (!lastMs) return '--:--';
    return new Date(lastMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [lastMs]);

  const secondsLeft = useMemo(() => {
    if (!nextMs) return null;
    return Math.max(0, Math.floor((nextMs - nowMs) / 1000));
  }, [nextMs, nowMs]);

  return { timeLeft, lastUpdateLabel, secondsLeft };
}

