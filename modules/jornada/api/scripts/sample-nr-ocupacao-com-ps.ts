/** Um NR_ATENDIMENTO que exista em tbl_ocupacao_internacao E tenha ligação PS (para testar no mapa de leitos). */
import path from 'path';
import duckdb from 'duckdb';

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const censo = path.join(repo, 'modules', 'censo', 'banco local');
const jornada = path.join(repo, 'modules', 'jornada', 'data', 'local');
const quote = (p: string) => path.resolve(p).replace(/\\/g, '/').replace(/'/g, "''");

const ocQ = quote(path.join(censo, 'tbl_ocupacao_internacao.parquet'));
const psQ = quote(path.join(jornada, 'tbl_tempos_entrada_consulta_saida.parquet'));

const sql = `
WITH occ AS (
  SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr
  FROM read_parquet('${ocQ}')
  WHERE NR_ATENDIMENTO IS NOT NULL
),
ps AS (
  SELECT
    CAST(NR_ATENDIMENTO AS VARCHAR) AS nr_ps,
    NULLIF(TRIM(CAST(NR_ATENDIMENTO_INT AS VARCHAR)), '') AS nr_int
  FROM read_parquet('${psQ}')
),
ps_chaves AS (
  SELECT nr_ps AS k FROM ps
  UNION
  SELECT nr_int AS k FROM ps WHERE nr_int IS NOT NULL
)
SELECT o.nr AS nr_no_mapa_leitos,
  (SELECT paciente FROM read_parquet('${psQ}') WHERE CAST(NR_ATENDIMENTO AS VARCHAR) = o.nr OR CAST(NR_ATENDIMENTO_INT AS VARCHAR) = o.nr LIMIT 1) AS nome
FROM occ o
WHERE o.nr IN (SELECT k FROM ps_chaves)
LIMIT 5;
`;

const db = new duckdb.Database(':memory:');
const conn = db.connect();
conn.all(sql, (err, rows: Record<string, unknown>[]) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log('\nNR presentes em OCUPAÇÃO (aparecem no mapa) com ligação PS:\n');
  for (const r of rows) {
    console.log(' ', String(r.nr_no_mapa_leitos), ' — ', String(r.nome ?? ''));
  }
  console.log('\nUse o primeiro # na pesquisa do dashboard.\n');
  process.exit(0);
});
