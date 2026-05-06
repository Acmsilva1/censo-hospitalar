import path from 'path';
import fs from 'fs';

/** Raiz do repositório (3 níveis acima de `api/src/core/`). */
export const REPO_ROOT = path.join(__dirname, '..', '..', '..');

/** Parquet em `data/local/`. Sobrescreva com `JORNADA_DADOS_DIR`. */
export function getDadosDir(): string {
  if (process.env.JORNADA_DADOS_DIR) return path.resolve(process.env.JORNADA_DADOS_DIR);

  const candidates = [
    path.join(REPO_ROOT, 'data', 'local'),
    path.resolve(REPO_ROOT, '..', '..', '..', '..', 'datalake', 'hospital'),
    path.resolve(REPO_ROOT, '..', '..', '..', 'datalake', 'hospital'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'tbl_tempos_entrada_consulta_saida.parquet'))) return dir;
    if (fs.existsSync(path.join(dir, 'tbl_tempos_entrada_consulta_saida.csv'))) return dir;
  }

  return candidates[1];
}

export function getApiPort(): number {
  return Number(process.env.JORNADA_API_PORT || process.env.PORT || 3211);
}
