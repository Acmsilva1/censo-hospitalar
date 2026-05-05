import path from 'path';
import duckdb from 'duckdb';

const jornadaDir = path.resolve(__dirname, '..', '..', 'data', 'local');
const q = (f: string) => path.join(jornadaDir, f).replace(/\\/g, '/').replace(/'/g, "''");

const db = new duckdb.Database(':memory:');
const conn = db.connect();

(async () => {
  for (const base of ['tbl_farm_relatorio_pendentes_base', 'tbl_farm_relatorio_liberadas_base']) {
    const pq = `${base}.parquet`;
    const sql = `
      SELECT '${base}' AS tabela,
             COUNT(*) AS linhas,
             COUNT(DISTINCT PADRAO) AS distintos_padrao
      FROM read_parquet('${q(pq)}')
    `;
    const rows = await new Promise<Record<string, unknown>[]>((res, rej) =>
      conn.all(sql, (e, r) => (e ? rej(e) : res(r as Record<string, unknown>[])))
    );
    const ex = await new Promise<Record<string, unknown>[]>((res, rej) =>
      conn.all(
        `SELECT DISTINCT CAST(PADRAO AS VARCHAR) AS padrao FROM read_parquet('${q(pq)}') WHERE PADRAO IS NOT NULL AND TRIM(CAST(PADRAO AS VARCHAR)) <> '' LIMIT 8`,
        (e, r) => (e ? rej(e) : res(r as Record<string, unknown>[]))
      )
    );
    const safe = (v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
    const o: Record<string, unknown> = { ...rows[0], exemplos_padrao: ex.map((x) => safe(x.padrao)) };
    for (const k of Object.keys(o)) {
      if (k !== 'exemplos_padrao') o[k] = safe(o[k]);
    }
    console.log(JSON.stringify(o, null, 2));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
