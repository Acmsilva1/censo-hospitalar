import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function defaultDatasetPath(): string {
  const cwd = process.cwd();
  const bancoLocal = path.resolve(cwd, '../banco local');
  const dados = path.resolve(cwd, '../dados');
  const pq = 'tbl_intern_leitos.parquet';
  const csv = 'tbl_intern_leitos.csv';
  if (fs.existsSync(path.join(bancoLocal, pq)) || fs.existsSync(path.join(bancoLocal, csv))) {
    return bancoLocal;
  }
  return dados;
}

export const config = {
  PORT:            process.env.PORT || 3212,
  /** Pasta com `*.parquet` (preferido) ou `*.csv` das tabelas Tasy. Override: `DATASET_PATH`. */
  DATASET_PATH:    process.env.DATASET_PATH
    ? path.resolve(process.env.DATASET_PATH)
    : defaultDatasetPath(),
  UPDATE_INTERVAL: 10 * 60 * 1000, // 10 minutos
  IS_DEV:          process.env.NODE_ENV !== 'production',
  DATA_SOURCE:     (process.env.DATA_SOURCE || (process.env.NODE_ENV === 'production' ? 'postgres' : 'duckdb')).toLowerCase(),
  DATABASE_URL:    process.env.DATABASE_URL || '',
  DUCKDB_PATH:     path.resolve(process.env.DUCKDB_PATH || path.join(process.cwd(), '.local', 'censo.duckdb')),
  REDIS_URL:       process.env.REDIS_URL,
  /** API Jornada (PS) — proxy do histórico no card de internação. */
  JORNADA_API_URL: process.env.JORNADA_API_URL || 'http://localhost:3211',
};
