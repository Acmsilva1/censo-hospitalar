import fs from 'fs';
import path from 'path';
import duckdb from 'duckdb';
import { Pool } from 'pg';

type Row = Record<string, unknown>;

const DATA_SOURCE = (process.env.DATA_SOURCE || (process.env.NODE_ENV === 'production' ? 'postgres' : 'duckdb')).toLowerCase();
const DATABASE_URL = process.env.DATABASE_URL || '';
const DUCKDB_PATH = path.resolve(process.env.DUCKDB_PATH || path.join(process.cwd(), '.local', 'jornada.duckdb'));

function normalizeRow<T extends Row>(row: T): T {
  const out = { ...row } as Row;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'bigint') {
      const n = Number(v);
      out[k] = Number.isSafeInteger(n) ? n : v.toString();
    }
  }
  return out as T;
}

export interface SqlDataSource {
  initialize(dadosDir: string): Promise<void>;
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  sourceName(): string;
}

class DuckDbSource implements SqlDataSource {
  private db: duckdb.Database;
  private conn: duckdb.Connection;
  constructor() {
    fs.mkdirSync(path.dirname(DUCKDB_PATH), { recursive: true });
    this.db = new duckdb.Database(DUCKDB_PATH);
    this.conn = this.db.connect();
  }
  sourceName(): string {
    return `duckdb:${DUCKDB_PATH}`;
  }
  async initialize(dadosDir: string): Promise<void> {
    const files = [
      'tbl_tempos_entrada_consulta_saida',
      'tbl_tempos_laboratorio',
      'tbl_tempos_medicacao',
      'tbl_tempos_rx_e_ecg',
      'tbl_tempos_tc_e_us',
      'tbl_tempos_reavaliacao',
      'tbl_vias_medicamentos',
      'meta_tempos',
    ];
    for (const base of files) {
      const pq = path.join(dadosDir, `${base}.parquet`);
      if (!fs.existsSync(pq)) continue;
      const q = path.resolve(pq).replace(/\\/g, '/').replace(/'/g, "''");
      await this.query(`CREATE OR REPLACE VIEW ${base} AS SELECT * FROM read_parquet('${q}')`);
    }
  }
  async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, ...(params as any[]), (err: Error | null, rows?: any) => {
        if (err) return reject(err);
        const out = ((rows || []) as Row[]).map((r) => normalizeRow(r));
        resolve(out as T[]);
      });
    });
  }
}

class PostgresSource implements SqlDataSource {
  private pool = new Pool({ connectionString: DATABASE_URL });
  sourceName(): string {
    return 'postgres';
  }
  async initialize(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
  async query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return (result.rows || []).map((r: unknown) => normalizeRow(r as Row)) as T[];
  }
}

let instance: SqlDataSource | null = null;
export function getSqlDataSource(): SqlDataSource {
  if (!instance) {
    instance = DATA_SOURCE === 'postgres' ? new PostgresSource() : new DuckDbSource();
  }
  return instance;
}
