import { createClient } from 'redis';

export class RedisService {
  private client;
  public isConnected = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      this.client = createClient({ url: redisUrl });

      this.client.on('error', (err) => {
        // Log apenas se estivermos tentando usar o Redis ativamente
        if (this.isConnected) {
          console.error('[Redis] Erro na conexão ativa:', err.message);
          this.isConnected = false;
        }
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[Redis] Conexão estabelecida com sucesso.');
      });
    } else {
      console.log('[Redis] Configuração ausente. Operando em modo 100% In-Memory (Alta Performance).');
    }
  }

  public async connect(): Promise<void> {
    if (!process.env.REDIS_URL || !this.client) return;
    
    if (!this.isConnected) {
      console.log('[Redis] Tentando conectar ao servidor...');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout na conexão')), 3000)
      );

      try {
        await Promise.race([
          this.client.connect(),
          timeoutPromise
        ]);
        console.log('[Redis] Conexão estabelecida com sucesso.');
      } catch (err: any) {
        console.warn(`[Redis] Falha ao conectar: ${err.message}. Operando em modo in-memory.`);
        throw err; // Repassa para o server.ts tratar
      }
    }
  }

  public async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }
}
