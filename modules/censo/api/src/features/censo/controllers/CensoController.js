import express from 'express';
import { CensoService } from '../services/CensoService.js';
export class CensoController {
    censoService;
    constructor() {
        this.censoService = CensoService.getInstance();
    }
    // --- Endpoints API (HTTP) ---
    getHealth = (req, res) => {
        const timestamps = this.censoService.getTimestamps();
        res.json({ status: 'OK', ...timestamps });
    };
    getHospitals = (req, res) => {
        const hospitals = this.censoService.getAllHospitals();
        res.json(hospitals);
    };
    manualRefresh = async (req, res) => {
        try {
            await this.censoService.triggerManualRefresh();
            res.json({ message: 'Sincronização manual iniciada' });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    };
    // --- Eventos de Socket.io ---
    handleSocketConnection = (socket) => {
        console.log(`[CensoController] Socket conectado: ${socket.id}`);
        socket.emit('orchestrator-correlations-snapshot', {
            items: this.censoService.getOrchestratorCorrelations(),
        });
        socket.on('join-hospital', (hospitalName) => {
            socket.join(hospitalName);
            const data = this.censoService.getHospitalData(hospitalName);
            if (data) {
                socket.emit('censo-initial-state', {
                    data,
                    stats: this.censoService.getHospitalStats(hospitalName),
                    ...this.censoService.getTimestamps()
                });
            }
            else {
                socket.emit('censo-error', 'Hospital não encontrado');
            }
        });
        socket.on('leave-hospital', (hospitalName) => {
            socket.leave(hospitalName);
        });
        socket.on('disconnect', () => {
            console.log(`[CensoController] Socket desconectado: ${socket.id}`);
        });
    };
}
//# sourceMappingURL=CensoController.js.map