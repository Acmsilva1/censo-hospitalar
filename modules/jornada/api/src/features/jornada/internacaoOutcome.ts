/** Valor presente no Parquet / DuckDB (exclui NULL literal em string). */
export function hasValorCampo(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== '' && s !== 'NULL' && s !== 'null';
}

/**
 * Internação: texto com "intern" em desfecho/tipo/destino/alta OU vínculo estrutural
 * (DT_INTERNACAO, NR_ATENDIMENTO_INT, CID_INTERNADO). Alinhado à fila e ao mapa.
 */
export function isInternacaoOutcome(row: Record<string, unknown>): boolean {
  const texto = ['DESFECHO', 'DS_TIPO_ALTA', 'DESTINO', 'ALTA_HOSPITALAR', 'ALTA_MEDICA']
    .map((k) => String(row[k] ?? '').toLowerCase())
    .join('|');
  const textoIntern = texto.includes('intern');

  const estrutural =
    hasValorCampo(row.DT_INTERNACAO) ||
    hasValorCampo(row.NR_ATENDIMENTO_INT) ||
    hasValorCampo(row.CID_INTERNADO);

  const temMarco =
    hasValorCampo(row.DT_DESFECHO) ||
    hasValorCampo(row.DT_INTERNACAO) ||
    hasValorCampo(row.NR_ATENDIMENTO_INT);

  return (textoIntern || estrutural) && temMarco;
}
