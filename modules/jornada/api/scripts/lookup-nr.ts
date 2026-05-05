/** Procura NR em ocupação, internações e PS. Uso: npx tsx scripts/lookup-nr.ts 369278 385278 */
import path from 'path';
import duckdb from 'duckdb';

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const censo = path.join(repo, 'modules', 'censo', 'banco local');
const jornada = path.join(repo, 'modules', 'jornada', 'data', 'local');
const q = (abs: string) => abs.replace(/\\/g, '/').replace(/'/g, "''");

const ids = process.argv.slice(2).filter(Boolean);
if (ids.length === 0) {
  console.error('Passe um ou mais NR, ex: npx tsx scripts/lookup-nr.ts 369278 385278');
  process.exit(1);
}

const oc = q(path.join(censo, 'tbl_ocupacao_internacao.parquet'));
const intr = q(path.join(censo, 'tbl_intern_internacoes.parquet'));
const ps = q(path.join(jornada, 'tbl_tempos_entrada_consulta_saida.parquet'));

const db = new duckdb.Database(':memory:');
const conn = db.connect();

const sql = (nr: string) => `
SELECT '${nr}' AS procurado,
  (SELECT COUNT(*) FROM read_parquet('${oc}') WHERE CAST(NR_ATENDIMENTO AS VARCHAR) = '${nr}') AS linhas_ocupacao,
  (SELECT COUNT(*) FROM read_parquet('${intr}') WHERE CAST(NR_ATENDIMENTO AS VARCHAR) = '${nr}') AS linhas_internacoes,
  (SELECT COUNT(*) FROM read_parquet('${ps}') WHERE CAST(NR_ATENDIMENTO AS VARCHAR) = '${nr}') AS linhas_ps_nr_atendimento,
  (SELECT COUNT(*) FROM read_parquet('${ps}') WHERE CAST(NR_ATENDIMENTO_INT AS VARCHAR) = '${nr}') AS linhas_ps_nr_int_igual_nr;
`;

(async () => {
  for (const nr of ids) {
    const rows = await new Promise<Record<string, unknown>[]>((res, rej) =>
      conn.all(sql(nr.trim()), (e, r) => (e ? rej(e) : res(r as Record<string, unknown>[])))
    );
    const o = rows[0] || {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) out[k] = v == null ? '' : String(v);
    console.log(JSON.stringify(out, null, 2));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
