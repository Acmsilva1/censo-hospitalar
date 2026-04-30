import type { ICensoRepository } from '../repositories/ICensoRepository.js';
import { Server } from 'socket.io';
/** Espelha o estado correlacionado do orquestrador (limbo PS ↔ leito no centro). */
export type OrchestratorCorrelationPayload = {
    atendimentoId: string;
    pacienteId: string;
    internacaoIndicadaAt?: string;
    leitoStatus?: string;
    leitoId?: string;
    limboAguardandoLeito: boolean;
    updatedAt: string;
};
export declare class CensoService {
    private static instance;
    private duckDbParser;
    private redisService;
    private hospitalCache;
    private statsCache;
    private lastUpdate;
    private nextUpdate;
    private io?;
    private updateQueue;
    /** Estado enviado pelo orquestrador: pacientes em limbo ou já vinculados a leito. */
    private orchestratorCorrelations;
    private constructor();
    /** @deprecated O DuckDB agora gerencia os próprios dados */
    setRepository(_repository: ICensoRepository): void;
    static getInstance(): CensoService;
    setSocketServer(io: Server): void;
    initialize(): Promise<void>;
    triggerManualRefresh(): Promise<void>;
    refreshData(): Promise<void>;
    getHospitalData(hospitalName: string): Record<string, Record<string, import("../models/Censo.js").Bed[]>>;
    getHospitalStats(hospitalName: string): any;
    getAllHospitals(): string[];
    /**
     * Atualiza correlação PS ↔ internação recebida do orquestrador e notifica clientes Socket.IO.
     * Em `limboAguardandoLeito`, o PS já indicou internação e o centro ainda não fixou leito.
     */
    applyOrchestratorCorrelation(raw: OrchestratorCorrelationPayload): void;
    getOrchestratorCorrelations(): OrchestratorCorrelationPayload[];
    getOrchestratorCorrelation(atendimentoId: string, pacienteId: string): OrchestratorCorrelationPayload | undefined;
    getTimestamps(): {
        lastUpdate: string;
        nextUpdate: string;
    };
    private updateTimestamps;
    private saveToRedis;
    private broadcastUpdates;
}
//# sourceMappingURL=CensoService.d.ts.map