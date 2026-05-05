import path from 'path';
import duckdb from 'duckdb';

const repo = path.resolve(__dirname, '..', '..', '..', '..');
const censo = path.join(repo, 'modules', 'censo', 'banco local');
const q = (f: string) =>
  path.join(censo, f).replace(/\\/g, '/').replace(/'/g, "''");

const db = new duckdb.Database(':memory:');
const conn = db.connect();

function describe(label: string, file: string) {
  const sql = `DESCRIBE SELECT * FROM read_parquet('${q(file)}')`;
  return new Promise<void>((resolve, reject) => {
    conn.all(sql, (err, rows: { column_name: string }[]) => {
      if (err) return reject(err);
      console.log(`\n=== ${label} ===`);
      console.log(rows.map((r) => r.column_name).join(', '));
      resolve();
    });
  });
}

(async () => {
  await describe('tbl_ocupacao_internacao', 'tbl_ocupacao_internacao.parquet');
  await describe('tbl_intern_internacoes', 'tbl_intern_internacoes.parquet');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
