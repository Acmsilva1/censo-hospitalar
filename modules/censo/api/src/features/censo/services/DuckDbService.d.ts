/**
 * DuckDbService — O Motor de Dados da Aplicação
 *
 * DuckDB in-memory: ingere **Parquet** (preferido) ou **CSV** por tabela (somente leitura).
 */
export declare class DuckDbService {
    private static instance;
    private db;
    private conn;
    private isInitialized;
    private constructor();
    static getInstance(): DuckDbService;
    /**
     * Executa uma query SQL e retorna os resultados como Promise
     */
    query<T>(sql: string, params?: any[]): Promise<T[]>;
    /**
     * Inicializa o banco: carrega Parquet/CSV da pasta `DATASET_PATH` e cria as views de negócio.
     */
    initialize(): Promise<void>;
    /**
     * Recarrega os dados (Refresh)
     */
    refresh(): Promise<void>;
    private setupViews;
}
//# sourceMappingURL=DuckDbService.d.ts.map