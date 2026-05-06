import type { ClinicalOutcome } from './ccTypes';

/** Espelha a heurística da cc-api para modo demo / payloads antigos sem `clinicalOutcome`. */
function normalizeEvent(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s.:;,\-_]+|[\s.:;,\-_]+$/g, '')
    .trim();
}

export function inferClinicalOutcome(lastEvent: string | null | undefined): ClinicalOutcome | null {
  const ev = normalizeEvent(lastEvent || '');
  if (!ev) return null;
  if (ev.includes('obito')) return 'OBITO';
  if (
    ev.includes('uti') ||
    ev.includes('upc') ||
    ev.includes('para ui') ||
    ev.includes('internacao') ||
    ev.includes('internado') ||
    (ev.includes('intern') && (ev.includes('enferm') || ev.includes('enfermaria'))) ||
    ev.includes('enfermaria') ||
    ev.includes('hospitaliz')
  ) {
    return 'INTERNACAO';
  }
  if (
    ev.includes('para casa') ||
    (ev.includes('saida') && ev.includes('casa')) ||
    ev.includes('alta hospitalar') ||
    ev.includes('alta medica') ||
    ev.includes('alta médica') ||
    ev.includes('alta enfermaria') ||
    (ev.includes('alta') && (ev.includes('paciente') || ev.includes('medica') || ev.includes('hospitalar')))
  ) {
    return 'ALTA';
  }
  return null;
}

export function clinicalOutcomeLabelPt(o: ClinicalOutcome): string {
  switch (o) {
    case 'ALTA':
      return 'Alta';
    case 'INTERNACAO':
      return 'Internação';
    case 'OBITO':
      return 'Óbito';
    default:
      return '';
  }
}
