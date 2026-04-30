type Row = Record<string, unknown>;
export interface SqlDataSource {
    initialize(): Promise<void>;
    refresh(): Promise<void>;
    query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
    sourceName(): string;
}
export declare function getDataSource(): SqlDataSource;
export {};
//# sourceMappingURL=SqlDataSource.d.ts.map