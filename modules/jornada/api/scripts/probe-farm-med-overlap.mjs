/**
 * Lista NR com PADRAO=N na farm que também existem em tbl_tempos_medicacao
 * (útil para validar extracts alinhados e testar destaque no modal PS).
 * Uso: node scripts/probe-farm-med-overlap.mjs (a partir de modules/jornada/api)
 */
import duckdb from 'duckdb';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dirs = [
  path.resolve(__dirname, '../../data/local'),
  path.resolve(__dirname, '../../../censo/banco local'),
];

const run = (sql) =>
  new Promise((resolve, reject) => {
    const db = new duckdb.Database(':memory:');
    const c = db.connect();
    c.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

const j = (o) =>
  JSON.stringify(
    o,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2
  );

const pickDir = (label, dir) => {
  const farmPend = path.join(dir, 'tbl_farm_relatorio_pendentes_base.parquet').replace(/\\/g, '/');
  const farmLib = path.join(dir, 'tbl_farm_relatorio_liberadas_base.parquet').replace(/\\/g, '/');
  const med = path.join(dir, 'tbl_tempos_medicacao.parquet').replace(/\\/g, '/');
  return { label, dir, farmPend, farmLib, med };
};

const probeOne = async ({ label, farmPend, farmLib, med }) => {
  console.log(`\n========== ${label} ==========`);

  const stats = await run(`
    SELECT
      (SELECT count(*) FROM read_parquet('${farmPend}')) AS pend_rows,
      (SELECT count(*) FROM read_parquet('${farmLib}')) AS lib_rows,
      (SELECT count(*) FROM read_parquet('${farmPend}') WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N') AS pend_n,
      (SELECT count(*) FROM read_parquet('${farmLib}') WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N') AS lib_n,
      (SELECT count(*) FROM read_parquet('${med}')) AS med_rows
  `);
  console.log('--- contagens ---');
  console.log(j(stats));

  const sampleN = await run(`
    SELECT NR_ATENDIMENTO::VARCHAR AS nr, MEDICAMENTO::VARCHAR AS med, PADRAO::VARCHAR AS p
    FROM read_parquet('${farmPend}')
    WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N'
    LIMIT 5
  `);
  console.log('--- amostra farm pendente PADRAO=N ---');
  console.log(j(sampleN));

  const sql = `
WITH farm AS (
  SELECT NR_ATENDIMENTO::VARCHAR AS nr, MEDICAMENTO::VARCHAR AS med, PADRAO::VARCHAR AS p,
         COALESCE(CAST(DT_ADMIN AS VARCHAR), CAST(DT_LIBERACAO AS VARCHAR)) AS dt_f
  FROM read_parquet('${farmPend}')
  WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N'
  UNION ALL
  SELECT NR_ATENDIMENTO::VARCHAR, MEDICAMENTO::VARCHAR, PADRAO::VARCHAR,
         CAST(DT_LIBERACAO AS VARCHAR) AS dt_f
  FROM read_parquet('${farmLib}')
  WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N'
),
m AS (
  SELECT * FROM read_parquet('${med}')
)
SELECT f.nr, f.med AS farm_med, f.dt_f, m.*
FROM farm f
INNER JOIN m ON trim(m.NR_ATENDIMENTO::VARCHAR) = trim(f.nr)
LIMIT 8
`;

  const joined = await run(sql);
  console.log('--- join farm N + med (mesmo NR) ---');
  console.log(j(joined));

  const overlap = await run(`
    WITH farm_n AS (
      SELECT DISTINCT NR_ATENDIMENTO::VARCHAR AS nr
      FROM read_parquet('${farmPend}')
      WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N'
      UNION
      SELECT DISTINCT NR_ATENDIMENTO::VARCHAR
      FROM read_parquet('${farmLib}')
      WHERE upper(trim(CAST(PADRAO AS VARCHAR))) = 'N'
    ),
    med_nrs AS (
      SELECT DISTINCT cast(NR_ATENDIMENTO AS VARCHAR) AS nr FROM read_parquet('${med}')
    )
    SELECT f.nr FROM farm_n f INNER JOIN med_nrs m ON m.nr = f.nr LIMIT 15
  `);
  console.log('--- NR em farm N e também em tbl_tempos_medicacao ---');
  console.log(j(overlap));

  if (overlap.length === 0) {
    console.log('(sem interseção farm N × med nesta pasta)');
    return null;
  }
  const pick = overlap[0].nr;
  const medOne = await run(`
    SELECT * FROM read_parquet('${med}')
    WHERE cast(NR_ATENDIMENTO AS VARCHAR) = '${pick}'
    LIMIT 5
  `);
  console.log(`--- medicação NR=${pick} ---`);
  console.log(j(medOne));
  return pick;
};

const main = async () => {
  for (const dir of dirs) {
    const cfg = pickDir(path.basename(dir), dir);
    try {
      const nr = await probeOne(cfg);
      if (nr) {
        console.log(
          `\n>>> Para ver o destaque: API Jornada com JORNADA_DADOS_DIR apontando para esta pasta; atendimento #${nr}.`
        );
      }
    } catch (e) {
      console.error(cfg.label, e?.message || e);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
