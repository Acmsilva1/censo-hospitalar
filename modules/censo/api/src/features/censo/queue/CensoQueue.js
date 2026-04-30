// ============================================================
// CensoQueue — Camada de Mensageria (In-Memory)
//
// Substitui a chamada direta do CensoService.refreshData() por
// um sistema de jobs (trabalhos). Isso permite o processamento
// assíncrono, retries automáticos em caso de falha da fonte
// de dados, e emissão de status da fila via Socket para o front.
// ============================================================
export class CensoQueue {
    queue = [];
    currentStatus = 'idle';
    processing = false;
    statusListeners = [];
    /** Adiciona um trabalho (job) ao final da fila */
    enqueue(job) {
        const newJob = {
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
    onStatusChange(listener) {
        this.statusListeners.push(listener);
    }
    setStatus(status) {
        this.currentStatus = status;
        this.broadcastStatus();
    }
    broadcastStatus() {
        const size = this.queue.length;
        this.statusListeners.forEach((listener) => listener(this.currentStatus, size));
    }
    async processNext() {
        if (this.queue.length === 0) {
            this.processing = false;
            this.setStatus('idle');
            return;
        }
        this.processing = true;
        const job = this.queue.shift();
        job.attempts++;
        try {
            this.setStatus('processing');
            await job.execute();
            this.setStatus('completed');
            if (job.onComplete)
                job.onComplete();
        }
        catch (error) {
            console.error(`[CensoQueue] Erro no Job ${job.id}:`, error.message);
            if (job.attempts < job.maxAttempts) {
                console.log(`[CensoQueue] Fazendo retry do Job ${job.id} (Tentativa ${job.attempts + 1}/${job.maxAttempts})...`);
                this.setStatus('retrying');
                // Repõe na frente da fila (ou no final, dependendo da estratégia)
                this.queue.unshift(job);
                // Espera um backoff antes do retry
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
            else {
                console.error(`[CensoQueue] Job ${job.id} falhou definitivamente (Dead-Letter).`);
                this.setStatus('failed');
                if (job.onError)
                    job.onError(error);
            }
        }
        // Processa o próximo item após pequeno atraso para liberar o event loop
        setTimeout(() => this.processNext(), 100);
    }
}
//# sourceMappingURL=CensoQueue.js.map