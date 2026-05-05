import path from 'path';
import duckdb from 'duckdb';

const jornadaDir = path.resolve(__dirname, '..', '..', 'data', 'local');
const quote = (f: string) => path.join(jornadaDir, f).replace(/\\/g, '/').replace(/'/g, "''");

const files = [
  'tbl_farm_relatorio_pendentes_base.parquet',
  'tbl_farm_relatorio_liberadas_base.parquet',
];

const db = new duckdb.Database(':memory:');
const conn = db.connect();

(async () => {
  for (const f of files) {
    const sql = `DESCRIBE SELECT * FROM read_parquet('${quote(f)}')`;
    const rows = await new Promise<{ column_name: string }[]>((res, rej) =>
      conn.all(sql, (e, r) => (e ? rej(e) : res(r as { column_name: string }[])))
    );
    console.log(`\n=== ${f} ===\n${rows.map((x) => x.column_name).join(', ')}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
