/**
 * Utilitários de formatação para exibição de dados no Frontend
 */

/**
 * Remove o termo "PS" (Pronto Socorro) dos nomes dos hospitais para foco em Internação.
 * Exemplos: 
 *   "DF - PS SIG" -> "DF - SIG"
 *   "MG BH GUTIERREZ - PS" -> "MG BH GUTIERREZ"
 */
export const formatHospitalName = (name: string): string => {
  if (!name) return name;
  
  let formatted = name
    .replace(/\s*-\s*PS\s*$/i, '')           // Remove " - PS" ao final
    .replace(/\bPS\s*-\s*/i, '')             // Remove "PS - " no início/meio
    .replace(/\bPS\s+/i, '')                 // Remove "PS " solto
    .replace(/\s+PS\b/i, '')                 // Remove " PS" solto
    .replace(/\s+/g, ' ')                    // Remove espaços duplos
    .trim();

  // Ajuste fino solicitado pelo usuário: MG BH GUTIERREZ -> MG - GUTIERREZ
  if (formatted.toUpperCase().includes('MG BH GUTIERREZ')) {
    return 'MG - GUTIERREZ';
  }

  return formatted;
};
