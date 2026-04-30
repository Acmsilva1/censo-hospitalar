export type JobStatus = 'idle' | 'processing' | 'completed' | 'failed' | 'retrying';
interface CensoJob {
    id: string;
    attempts: number;
    maxAttempts: number;
    execute: () => Promise<void>;
    onComplete?: () => void;
    onError?: (err: Error) => void;
}
export declare class CensoQueue {
    private queue;
    private currentStatus;
    private processing;
    private statusListeners;
    /** Adiciona um trabalho (job) ao final da fila */
    enqueue(job: Omit<CensoJob, 'id' | 'attempts'>): void;
    /** Adiciona um listener para ser notificado sempre que o status mudar */
    onStatusChange(listener: (status: JobStatus, queueSize: number) => void): void;
    private setStatus;
    private broadcastStatus;
    private processNext;
}
export {};
//# sourceMappingURL=CensoQueue.d.ts.map