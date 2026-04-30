export declare class RedisService {
    private client;
    isConnected: boolean;
    constructor();
    connect(): Promise<void>;
    set(key: string, value: string): Promise<void>;
    get(key: string): Promise<string | null>;
}
//# sourceMappingURL=RedisService.d.ts.map