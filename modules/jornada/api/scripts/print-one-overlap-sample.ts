/** Contagens overlap PS↔internação + 1 exemplo para testar o Histórico do PS no card do leito. */
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
WITH occ AS (SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr FROM read_parquet('${ocQ}')),
     intern AS (SELECT DISTINCT CAST(NR_ATENDIMENTO AS VARCHAR) AS nr FROM read_parquet('${inQ}')),
     all_int AS (SELECT nr FROM occ UNION SELECT nr FROM intern),
     ps AS (
       SELECT
         CAST(NR_ATENDIMENTO AS VARCHAR) AS nr_ps,
         NULLIF(TRIM(CAST(NR_ATENDIMENTO_INT AS VARCHAR)), '') AS nr_int,
         CAST(CD_PESSOA_FISICA AS VARCHAR) AS cd_pessoa,
         CAST(PACIENTE AS VARCHAR) AS paciente
       FROM read_parquet('${psQ}')
     ),
     matched AS (
       SELECT * FROM ps WHERE nr_int IS NOT NULL AND nr_int IN (SELECT nr FROM all_int)
     )
SELECT
  (SELECT COUNT(DISTINCT nr_ps) FROM matched) AS atendimentos_ps_distintos_com_match,
  (SELECT COUNT(DISTINCT cd_pessoa) FROM matched) AS pacientes_distintos_com_match,
  (SELECT nr_int FROM matched LIMIT 1) AS use_no_card_leito_ou_historico_ps,
  (SELECT nr_ps FROM matched LIMIT 1) AS nr_atendimento_ps_mesma_linha,
  (SELECT paciente FROM matched LIMIT 1) AS nome_paciente;
`;

const db = new duckdb.Database(':memory:');
const conn = db.connect();
conn.all(sql, (err: Error | null, rows: Record<string, unknown>[]) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  const r = rows[0] || {};
  const n = (v: unknown) => (v == null ? '' : Number(v));
  console.log('\nResumo (overlap: PS com NR_ATENDIMENTO_INT presente em ocupação ∪ internações):\n');
  console.log('  Atendimentos PS distintos com match:', n(r.atendimentos_ps_distintos_com_match));
  console.log('  Pacientes distintos (CD_PESSOA_FISICA) nesse conjunto:', n(r.pacientes_distintos_com_match));
  console.log('\nExemplo para testar (abrir leito cujo # do atendimento seja este número):\n');
  console.log('  # no card / journey:', r.use_no_card_leito_ou_historico_ps, ' — paciente:', r.nome_paciente);
  console.log('  (NR_ATENDIMENTO do PS na mesma linha:', r.nr_atendimento_ps_mesma_linha, ')\n');
  process.exit(0);
});
