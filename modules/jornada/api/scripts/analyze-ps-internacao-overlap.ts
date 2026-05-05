/**
 * Mede quantos atendimentos distintos do PS aparecem nas bases de internação (ocupação / internações).
 *
 * Uso (na pasta modules/jornada/api):
 *   npx tsx scripts/analyze-ps-internacao-overlap.ts
 *
 * Opcional:
 *   JORNADA_DADOS_DIR  — pasta com tbl_tempos_entrada_consulta_saida.parquet
 *   DATASET_PATH       — pasta com tbl_ocupacao_internacao.parquet e tbl_intern_internacoes.parquet
 */
import path from 'path';
import fs from 'fs';
import duckdb from 'duckdb';

function quotePath(absPath: string): string {
  return path.resolve(absPath).replace(/\\/g, '/').replace(/'/g, "''");
}

function resolveRepoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function main() {
  const repoRoot = resolveRepoRoot();
  const jornadaDir = process.env.JORNADA_DADOS_DIR
    ? path.resolve(process.env.JORNADA_DADOS_DIR)
    : path.join(repoRoot, 'modules', 'jornada', 'data', 'local');
  const censoDir = process.env.DATASET_PATH
    ? path.resolve(process.env.DATASET_PATH)
    : path.join(repoRoot, 'modules', 'censo', 'banco local');

  const psPq = path.join(jornadaDir, 'tbl_tempos_entrada_consulta_saida.parquet');
  const ocupPq = path.join(censoDir, 'tbl_ocupacao_internacao.parquet');
  const internPq = path.join(censoDir, 'tbl_intern_internacoes.parquet');

  console.log('[overlap] Jornada (PS):', jornadaDir);
  console.log('[overlap] Censo (internação):', censoDir);

  const missing: string[] = [];
  if (!fs.existsSync(psPq)) missing.push(psPq);
  if (!fs.existsSync(ocupPq)) missing.push(ocupPq);
  if (!fs.existsSync(internPq)) missing.push(internPq);
  if (missing.length > 0) {
    console.error('\nFicheiros em falta — não é possível calcular a percentagem:\n');
    missing.forEach((m) => console.error(' -', m));
    console.error(
      '\nCopie os Parquets para estas pastas ou defina JORNADA_DADOS_DIR / DATASET_PATH.\n'
    );
    process.exit(2);
  }

  const psQ = quotePath(psPq);
  const ocQ = quotePath(ocupPq);
  const inQ = quotePath(internPq);

  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  const sql = `
    WITH ps AS (
      SELECT
        CAST(NR_ATENDIMENTO AS VARCHAR) AS nr_ps,
        NULLIF(TRIM(CAST(NR_ATENDIMENTO_INT AS VARCHAR)), '') AS nr_int
      FROM read_parquet('${psQ}')
    ),
    ps_distinct AS (
      SELECT DISTINCT nr_ps, nr_int FROM ps
    ),
    occ AS (
      SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr FROM read_parquet('${ocQ}')
    ),
    intern AS (
      SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr FROM read_parquet('${inQ}')
    ),
    all_int AS (
      SELECT nr FROM occ UNION SELECT nr FROM intern
    ),
    scored AS (
      SELECT
        nr_ps,
        nr_int,
        (
          nr_ps IN (SELECT nr FROM all_int)
          OR (nr_int IS NOT NULL AND nr_int IN (SELECT nr FROM all_int))
        ) AS coberto
      FROM ps_distinct
    ),
    intern_hint AS (
      SELECT DISTINCT nr_ps, nr_int FROM ps
      WHERE nr_int IS NOT NULL
    ),
    scored_intern_subset AS (
      SELECT
        h.nr_ps,
        h.nr_int,
        (
          h.nr_ps IN (SELECT nr FROM all_int)
          OR (h.nr_int IS NOT NULL AND h.nr_int IN (SELECT nr FROM all_int))
        ) AS coberto
      FROM intern_hint h
    )
    SELECT
      'todos_ps' AS escopo,
      (SELECT COUNT(*) FROM scored) AS total_ps_distinct,
      (SELECT SUM(CASE WHEN coberto THEN 1 ELSE 0 END) FROM scored) AS ps_com_match_internacao,
      ROUND(
        100.0 * (SELECT SUM(CASE WHEN coberto THEN 1 ELSE 0 END) FROM scored)
          / NULLIF((SELECT COUNT(*) FROM scored), 0),
        2
      ) AS pct,
      (SELECT SUM(CASE WHEN nr_ps IN (SELECT nr FROM occ) THEN 1 ELSE 0 END) FROM scored) AS match_direto_nr_ps_em_ocupacao,
      (SELECT SUM(CASE WHEN nr_int IS NOT NULL AND nr_int IN (SELECT nr FROM all_int) THEN 1 ELSE 0 END) FROM scored)
        AS match_via_nr_atendimento_int
    UNION ALL
    SELECT
      'so_com_nr_atendimento_int' AS escopo,
      (SELECT COUNT(*) FROM scored_intern_subset) AS total_ps_distinct,
      (SELECT SUM(CASE WHEN coberto THEN 1 ELSE 0 END) FROM scored_intern_subset) AS ps_com_match_internacao,
      ROUND(
        100.0 * (SELECT SUM(CASE WHEN coberto THEN 1 ELSE 0 END) FROM scored_intern_subset)
          / NULLIF((SELECT COUNT(*) FROM scored_intern_subset), 0),
        2
      ) AS pct,
      NULL::BIGINT,
      NULL::BIGINT;
  `;

  conn.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
    if (err) {
      console.error('[overlap] Erro DuckDB:', err.message);
      process.exit(1);
    }
    console.log('\n--- Resultado ---\n');
    for (const r of rows) {
      const escopo = String(r.escopo);
      const total = Number(r.total_ps_distinct ?? 0);
      const cob = Number(r.ps_com_match_internacao ?? 0);
      const pct = Number(r.pct ?? 0);
      console.log(`Escopo: ${escopo}`);
      console.log('  Linhas distintas (nr_ps [+ nr_int]):', total);
      console.log('  Com match em ocupação ∪ internações:', cob);
      console.log('  Percentagem:', pct, '%');
      if (r.match_direto_nr_ps_em_ocupacao != null) {
        console.log('  Match direto NR_ATENDIMENTO (PS):', Number(r.match_direto_nr_ps_em_ocupacao));
        console.log('  Match via NR_ATENDIMENTO_INT:', Number(r.match_via_nr_atendimento_int));
      }
      console.log('');
    }
    const todos = rows.find((x) => x.escopo === 'todos_ps');
    const sub = rows.find((x) => x.escopo === 'so_com_nr_atendimento_int');
    const pctTodos = Number(todos?.pct ?? 0);
    const pctSub = Number(sub?.pct ?? 0);
    if (pctTodos >= 90) {
      console.log('No conjunto TOTAL do PS: ≥ 90% aparecem nas tabelas de internação.');
    } else {
      console.log(
        'No conjunto TOTAL do PS: a percentagem é baixa — normal, porque a maioria dos episódios não é internação.'
      );
    }
    if (pctSub >= 90 && Number(sub?.total_ps_distinct ?? 0) > 0) {
      console.log(
        'No subconjunto com NR_ATENDIMENTO_INT preenchido: ≥ 90% têm esse número presente na internação.'
      );
    } else if (Number(sub?.total_ps_distinct ?? 0) > 0) {
      console.log(
        'No subconjunto com NR_ATENDIMENTO_INT: percentagem de match =',
        pctSub,
        '% (meta 90% não atingida ou extracts/hospital desalinhados).'
      );
    }
    process.exit(0);
  });
}

main();
