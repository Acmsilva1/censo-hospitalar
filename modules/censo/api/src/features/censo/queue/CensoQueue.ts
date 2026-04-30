// ============================================================
// CensoQueue — Camada de Mensageria (In-Memory)
//
// Substitui a chamada direta do CensoService.refreshData() por
// um sistema de jobs (trabalhos). Isso permite o processamento
// assíncrono, retries automáticos em caso de falha da fonte
// de dados, e emissão de status da fila via Socket para o front.
// ============================================================

export type JobStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'retrying';

interface CensoJob {
  id: string;
  attempts: number;
  maxAttempts: number;
  execute: () => Promise<void>;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export class CensoQueue {
  private queue: CensoJob[] = [];
  private currentStatus: JobStatus = 'idle';
  private processing: boolean = false;
  private statusListeners: Array<(status: JobStatus, queueSize: number) => void> = [];

  /** Adiciona um trabalho (job) ao final da fila */
  public enqueue(job: Omit<CensoJob, 'id' | 'attempts'>): void {
    const newJob: CensoJob = {
      ...job,
      id: Math.random().toString(36).substring(7),
      attempts: 0,
    };
    this.queue.push(newJob);
    this.broadcastStatus();
    
    if (!this.processing) {
      this.processNext();
    }
  }

  /** Adiciona um listener para ser notificado sempre que o status mudar */
  public onStatusChange(listener: (status: JobStatus, queueSize: number) => void): void {
    this.statusListeners.push(listener);
  }

  private setStatus(status: JobStatus): void {
    this.currentStatus = status;
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    const size = this.queue.length;
    this.statusListeners.forEach((listener) => listener(this.currentStatus, size));
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      this.setStatus('idle');
      return;
    }

    this.processing = true;
    const job = this.queue.shift()!;
    job.attempts++;

    try {
      this.setStatus('processing');
      await job.execute();
      this.setStatus('completed');
      if (job.onComplete) job.onComplete();
    } catch (error: any) {
      console.error(`[CensoQueue] Erro no Job ${job.id}:`, error.message);
      
      if (job.attempts < job.maxAttempts) {
        console.log(`[CensoQueue] Fazendo retry do Job ${job.id} (Tentativa ${job.attempts + 1}/${job.maxAttempts})...`);
        this.setStatus('retrying');
        // Repõe na frente da fila (ou no final, dependendo da estratégia)
        this.queue.unshift(job);
        // Espera um backoff antes do retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        console.error(`[CensoQueue] Job ${job.id} falhou definitivamente (Dead-Letter).`);
        this.setStatus('failed');
        if (job.onError) job.onError(error);
      }
    }

    // Processa o próximo item após pequeno atraso para liberar o event loop
    setTimeout(() => this.processNext(), 100);
  }
}
