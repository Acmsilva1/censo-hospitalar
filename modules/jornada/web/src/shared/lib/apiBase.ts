/** Base da API Fastify. Sobrescreva com `VITE_API_URL` (ex.: http://127.0.0.1:3001). */
export const API_BASE = (
  import.meta.env.VITE_API_URL as string | undefined
)?.replace(/\/$/, '') || 'http://localhost:3211'
