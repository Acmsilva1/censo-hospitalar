/**
 * Regra de negócio: todo internado deveria ter passado pelo PS (ligação na base).
 * Mede quantos NR_ATENDIMENTO das tabelas de internação aparecem no conjunto
 * NR_ATENDIMENTO ∪ NR_ATENDIMENTO_INT da tabela PS.
 */
import path from 'path';
import duckdb from 'duckdb';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const jornadaDir = path.join(repoRoot, 'modules', 'jornada', 'data', 'local');
const censoDir = path.join(repoRoot, 'modules', 'censo', 'banco local');
const quote = (p: string) => path.resolve(p).replace(/\\/g, '/').replace(/'/g, "''");

const psQ = quote(path.join(jornadaDir, 'tbl_tempos_entrada_consulta_saida.parquet'));
const ocQ = quote(path.join(censoDir, 'tbl_ocupacao_internacao.parquet'));
const inQ = quote(path.join(censoDir, 'tbl_intern_internacoes.parquet'));

const sql = `
WITH intern_nrs AS (
  SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr
  FROM read_parquet('${ocQ}')
  WHERE NR_ATENDIMENTO IS NOT NULL
  UNION
  SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr
  FROM read_parquet('${inQ}')
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
),
scored AS (
  SELECT i.nr, (i.nr IN (SELECT k FROM ps_chaves)) AS tem_ps
  FROM intern_nrs i
)
SELECT
  COUNT(*) AS total_nr_internacao_distintos,
  SUM(CASE WHEN tem_ps THEN 1 ELSE 0 END) AS com_ligacao_ps,
  ROUND(100.0 * SUM(CASE WHEN tem_ps THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2) AS pct_com_ps
FROM scored;
`;

const db = new duckdb.Database(':memory:');
const conn = db.connect();
conn.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  const r = rows[0] || {};
  const total = Number(r.total_nr_internacao_distintos ?? 0);
  const com = Number(r.com_ligacao_ps ?? 0);
  const pct = Number(r.pct_com_ps ?? 0);
  const sem = total - com;
  console.log('\nInternação → PS (extract actual)\n');
  console.log('  NR_ATENDIMENTO distintos (ocupação ∪ internações):', total);
  console.log('  Com ligação na tabela PS (NR_ATENDIMENTO ou NR_ATENDIMENTO_INT):', com);
  console.log('  Sem ligação:', sem);
  console.log('  Cobertura:', pct, '%\n');
  process.exit(0);
});
