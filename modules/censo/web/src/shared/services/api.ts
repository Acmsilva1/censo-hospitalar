// ============================================================
// api.ts — Serviço de chamadas REST para o Backend
//
// Centraliza todas as chamadas HTTP, evitando fetch() espalhado
// pela aplicação. Usar este serviço em vez de fetch() direto.
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL || '';

async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}/api${endpoint}`);
  if (!response.ok) {
    throw new Error(`[API] Erro ${response.status}: ${response.statusText} — ${endpoint}`);
  }
  return response.json() as Promise<T>;
}

export const censoApi = {
  /** Retorna lista de hospitais disponíveis na API */
  getHospitals: (): Promise<string[]> =>
    get<string[]>('/hospitals'),

  /** Verifica status de saúde da API */
  getHealth: (): Promise<{ status: string; lastUpdate: string }> =>
    get('/health'),

  /** Dispara uma sincronização manual forçada */
  refresh: async (): Promise<{ message: string }> => {
    const response = await fetch(`${BASE_URL}/api/censo/refresh`, { method: 'POST' });
    if (!response.ok) throw new Error('[API] Falha ao disparar sincronização manual');
    return response.json();
  }
};
