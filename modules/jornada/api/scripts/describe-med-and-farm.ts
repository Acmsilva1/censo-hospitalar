import path from 'path';
import duckdb from 'duckdb';

const jornadaDir = path.resolve(__dirname, '..', '..', 'data', 'local');
const q = (f: string) => path.join(jornadaDir, f).replace(/\\/g, '/').replace(/'/g, "''");

const db = new duckdb.Database(':memory:');
const conn = db.connect();

async function desc(label: string, file: string) {
  const sql = `DESCRIBE SELECT * FROM read_parquet('${q(file)}')`;
  const rows = await new Promise<{ column_name: string }[]>((res, rej) =>
    conn.all(sql, (e, r) => (e ? rej(e) : res(r as { column_name: string }[])))
  );
  console.log(`\n${label}\n`, rows.map((r) => r.column_name).join(', '));
}

(async () => {
  await desc('tbl_tempos_medicacao', 'tbl_tempos_medicacao.parquet');
  await desc('pendentes', 'tbl_farm_relatorio_pendentes_base.parquet');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
