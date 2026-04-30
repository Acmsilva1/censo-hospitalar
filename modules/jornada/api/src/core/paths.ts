import path from 'path';

/** Raiz do repositório (3 níveis acima de `api/src/core/`). */
export const REPO_ROOT = path.join(__dirname, '..', '..', '..');

/** Parquet em `data/local/`. Sobrescreva com `JORNADA_DADOS_DIR`. */
export function getDadosDir(): string {
  return process.env.JORNADA_DADOS_DIR
    ? path.resolve(process.env.JORNADA_DADOS_DIR)
    : path.join(REPO_ROOT, 'data', 'local');
}

export function getApiPort(): number {
  return Number(process.env.JORNADA_API_PORT || process.env.PORT || 3211);
}
