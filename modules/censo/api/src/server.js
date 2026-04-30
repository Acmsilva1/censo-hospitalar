import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { config } from './core/config/env.js';
import { CensoService } from './features/censo/services/CensoService.js';
import { CensoController } from './features/censo/controllers/CensoController.js';
import routes from './features/censo/routes/censoRoutes.js';
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3020';
async function publishOrchestratorEvent(event) {
    try {
        const res = await fetch(`${ORCHESTRATOR_URL}/events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
        });
        if (!res.ok) {
            console.warn('[MVC Server] Falha ao publicar evento no orquestrador:', res.status);
        }
    }
    catch (err) {
        console.warn('[MVC Server] Orquestrador indisponivel para evento:', err);
    }
}
app.post('/api/integration/leito-status', async (req, res) => {
    const { atendimentoId, pacienteId, tipo, leitoId } = req.body || {};
    if (!atendimentoId || !pacienteId || !tipo) {
        return res.status(400).json({ error: 'atendimentoId, pacienteId e tipo sao obrigatorios' });
    }
    await publishOrchestratorEvent({
        eventId: `c-${atendimentoId}-${pacienteId}-${tipo}-${Date.now()}`,
        version: 1,
        type: String(tipo),
        timestamp: new Date().toISOString(),
        source: 'censo',
        atendimentoId: String(atendimentoId),
        pacienteId: String(pacienteId),
        payload: { leitoId: leitoId ? String(leitoId) : undefined },
    });
    return res.json({ ok: true });
});
/** Estado correlacionado pelo orquestrador (limbo PS + vínculo ao leito no centro). */
app.post('/api/integration/orchestrator-sync', (req, res) => {
    const body = req.body;
    if (!body?.atendimentoId || !body?.pacienteId) {
        return res.status(400).json({ error: 'atendimentoId e pacienteId sao obrigatorios' });
    }
    CensoService.getInstance().applyOrchestratorCorrelation({
        atendimentoId: String(body.atendimentoId),
        pacienteId: String(body.pacienteId),
        internacaoIndicadaAt: body.internacaoIndicadaAt,
        leitoStatus: body.leitoStatus,
        leitoId: body.leitoId != null ? String(body.leitoId) : undefined,
        limboAguardandoLeito: Boolean(body.limboAguardandoLeito),
        updatedAt: String(body.updatedAt || new Date().toISOString()),
    });
    return res.json({ ok: true });
});
app.get('/api/integration/orchestrator-correlations', (_req, res) => {
    res.json({ items: CensoService.getInstance().getOrchestratorCorrelations() });
});
// ── Entrega da SPA (build Vite em web/dist) ───────────────────────────
const webDistPath = path.resolve(import.meta.dirname, '../../web/dist');
app.use(express.static(webDistPath));
// Middleware de Fallback para SPA (React Router)
app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(webDistPath, 'index.html'));
    }
});
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });
// ── Injeção de Dependências (legado / compat — censo em produção via DuckDB) ──
// ── Injeção de Dependências ───────────────────────────────────────────
const censoService = CensoService.getInstance();
censoService.setSocketServer(io);
const censoController = new CensoController();
io.on('connection', censoController.handleSocketConnection);
// ── Boot ──────────────────────────────────────────────────────────────
httpServer.listen(config.PORT, async () => {
    console.log(`[MVC Server] 🚀 Gestão Hospitalar rodando na porta ${config.PORT}`);
    try {
        await censoService.initialize();
        console.log('[MVC Server] ✅ Censo Hospitalar Ativo e Sincronizado.');
    }
    catch (err) {
        console.error('[MVC Server] ❌ Falha na inicialização:', err.message);
    }
});
//# sourceMappingURL=server.js.map
