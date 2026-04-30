import { DuckDbParserService } from './DuckDbParserService.js';
import { getDataSource } from './SqlDataSource.js';
import { RedisService } from './RedisService.js';
import { config } from '../../../core/config/env.js';
import type { CensoState } from '../models/Censo.js';
import type { ICensoRepository } from '../repositories/ICensoRepository.js';
import { Server } from 'socket.io';
import { CensoQueue } from '../queue/CensoQueue.js';

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

export class CensoService {
  private static instance: CensoService;
  private duckDbParser: DuckDbParserService;
  private redisService: RedisService;
  private hospitalCache: CensoState = {};
  private statsCache: Record<string, any> = {};
  private lastUpdate: Date = new Date();
  private nextUpdate: Date = new Date();
  private io?: Server;
  private updateQueue: CensoQueue;
  /** Estado enviado pelo orquestrador: pacientes em limbo ou já vinculados a leito. */
  private orchestratorCorrelations = new Map<string, OrchestratorCorrelationPayload>();

  private constructor() {
    this.redisService = new RedisService();
    this.updateQueue = new CensoQueue();
    this.duckDbParser = new DuckDbParserService();
  }

  /** @deprecated O DuckDB agora gerencia os próprios dados */
  public setRepository(_repository: ICensoRepository): void {
    // Mantido para compatibilidade de interface, mas ignorado
  }

  public static getInstance(): CensoService {
    if (!CensoService.instance) {
      CensoService.instance = new CensoService();
    }
    return CensoService.instance;
  }

  public setSocketServer(io: Server) {
    this.io = io;
  }

  public async initialize(): Promise<void> {
    try {
      console.log('[CensoService] Inicializando dados via DuckDB...');
      
      // Garantir que o DuckDB está pronto antes da primeira carga
      await getDataSource().initialize();
      
      const { tree, stats } = await this.duckDbParser.parseDataset();
      this.hospitalCache = tree;
      this.statsCache = stats;
      this.updateTimestamps();
      
      try {
        await this.redisService.connect();
        await this.saveToRedis();
      } catch (e) {
        console.warn('[CensoService] Redis offline, operando em modo In-Memory.');
      }
      
      // Configurar mensageria: notificar o frontend do status da fila
      this.updateQueue.onStatusChange((status, queueSize) => {
        if (this.io) {
          this.io.emit('censo-queue-status', { status, queueSize });
        }
      });
      
      // Iniciar o ciclo de agendamento na fila
      setInterval(() => {
        this.updateQueue.enqueue({
          maxAttempts: 3,
          execute: async () => await this.refreshData(),
        });
      }, config.UPDATE_INTERVAL);
      
      console.log('[CensoService] Inicialização concluída. Queue System online.');
    } catch (error) {
      console.error('[CensoService] Erro na inicialização:', error);
      throw error;
    }
  }

  public async triggerManualRefresh(): Promise<void> {
    console.log('[CensoService] Gatilho manual disparado via API.');
    this.updateQueue.enqueue({
      maxAttempts: 1, // No manual, falha rápido se houver erro
      execute: async () => await this.refreshData(),
    });
  }

  public async refreshData(): Promise<void> {
    console.log('[CensoService] Executando Job da fila (Refresh DuckDB + Carga)...');
    try {
      // Forçar recarga dos ficheiros (Parquet/CSV) no DuckDB
      await getDataSource().refresh();
      
      const { tree, stats } = await this.duckDbParser.parseDataset();
      this.hospitalCache = tree;
      this.statsCache = stats;
      this.updateTimestamps();

      if (this.io) {
        this.broadcastUpdates();
      }

      await this.saveToRedis();
      console.log(`[CensoService] Job concluído com sucesso às ${this.lastUpdate.toLocaleTimeString()}`);
    } catch (error: any) {
      console.error(`[CensoService] Falha interna no Job: ${error.message}`);
      throw error; // Propaga o erro para a Queue acionar o Retry
    }
  }

  public getHospitalData(hospitalName: string) {
    return this.hospitalCache[hospitalName] || null;
  }

  public getHospitalStats(hospitalName: string) {
    return this.statsCache[hospitalName] || null;
  }

  public getAllHospitals(): string[] {
    return Object.keys(this.hospitalCache);
  }

  /**
   * Atualiza correlação PS ↔ internação recebida do orquestrador e notifica clientes Socket.IO.
   * Em `limboAguardandoLeito`, o PS já indicou internação e o centro ainda não fixou leito.
   */
  public applyOrchestratorCorrelation(raw: OrchestratorCorrelationPayload): void {
    const key = `${raw.atendimentoId}::${raw.pacienteId}`;
    const correlation: OrchestratorCorrelationPayload = {
      ...raw,
      limboAguardandoLeito: Boolean(raw.limboAguardandoLeito),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    this.orchestratorCorrelations.set(key, correlation);
    if (this.io) {
      this.io.emit('orchestrator-correlation', { key, correlation });
    }
  }

  public getOrchestratorCorrelations(): OrchestratorCorrelationPayload[] {
    return [...this.orchestratorCorrelations.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  public getOrchestratorCorrelation(
    atendimentoId: string,
    pacienteId: string
  ): OrchestratorCorrelationPayload | undefined {
    return this.orchestratorCorrelations.get(`${atendimentoId}::${pacienteId}`);
  }

  public getTimestamps() {
    return {
      lastUpdate: this.lastUpdate.toISOString(),
      nextUpdate: this.nextUpdate.toISOString()
    };
  }

  private updateTimestamps() {
    this.lastUpdate = new Date();
    this.nextUpdate = new Date(this.lastUpdate.getTime() + config.UPDATE_INTERVAL);
  }

  private async saveToRedis() {
    try {
      await this.redisService.set('censo_snapshot', JSON.stringify(this.hospitalCache));
    } catch (e) {}
  }

  private broadcastUpdates() {
    if (!this.io) return;

    this.io.emit('censo-update', this.getTimestamps());

    const hospitals = this.getAllHospitals();
    hospitals.forEach(h => {
      this.io?.to(h).emit('censo-initial-state', {
        data: this.hospitalCache[h],
        stats: this.statsCache[h],
        ...this.getTimestamps()
      });
    });
  }
}
