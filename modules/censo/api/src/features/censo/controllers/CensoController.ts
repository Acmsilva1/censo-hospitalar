import express from 'express';
import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';
import { CensoService } from '../services/CensoService.js';

export class CensoController {
  private censoService: CensoService;

  constructor() {
    this.censoService = CensoService.getInstance();
  }

  // --- Endpoints API (HTTP) ---

  public getHealth = (req: Request, res: Response) => {
    const timestamps = this.censoService.getTimestamps();
    res.json({ status: 'OK', ...timestamps });
  };

  public getHospitals = (req: Request, res: Response) => {
    const hospitals = this.censoService.getAllHospitals();
    res.json(hospitals);
  };

  public manualRefresh = async (req: Request, res: Response) => {
    try {
      await this.censoService.triggerManualRefresh();
      res.json({ message: 'Sincronização manual iniciada' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  // --- Eventos de Socket.io ---

  public handleSocketConnection = (socket: Socket) => {
    console.log(`[CensoController] Socket conectado: ${socket.id}`);

    socket.emit('orchestrator-correlations-snapshot', {
      items: this.censoService.getOrchestratorCorrelations(),
    });

    socket.on('join-hospital', (hospitalName: string) => {
      socket.join(hospitalName);
      const data = this.censoService.getHospitalData(hospitalName);
      
      if (data) {
        socket.emit('censo-initial-state', {
          data,
          stats: this.censoService.getHospitalStats(hospitalName),
          ...this.censoService.getTimestamps()
        });
      } else {
        socket.emit('censo-error', 'Hospital não encontrado');
      }
    });

    socket.on('leave-hospital', (hospitalName: string) => {
      socket.leave(hospitalName);
    });

    socket.on('disconnect', () => {
      console.log(`[CensoController] Socket desconectado: ${socket.id}`);
    });
  };
}
