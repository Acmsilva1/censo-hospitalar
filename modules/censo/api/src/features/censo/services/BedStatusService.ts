// ============================================================
// BedStatusService — Regras de Negócio centralizadas
//
// Centraliza a derivação de metadados, como emojis, isolamento,
// e cálculo de tempo de permanência ou alta clínica.
// ============================================================

export class BedStatusService {
  /** Deriva o emoji de gênero do paciente baseado no sexo */
  public static getPatientEmoji(sex?: string | null): string | null {
    if (!sex) return null;
    const sexUpper = sex.toUpperCase();
    if (sexUpper.includes('FEMININO')) return '👵';
    if (sexUpper.includes('MASCULINO')) return '👴';
    return null;
  }

  /** Normaliza os termos técnicos do Tasy para o domínio amigável da aplicação */
  public static normalizeStatus(rawStatus: string): string {
    if (!rawStatus) return 'Disponível';
    const s = rawStatus.toUpperCase().trim();
    
    // Log de auditoria para depuração em tempo real
    // console.log(`[StatusNormalizer] Recebido: "${rawStatus}" -> Normalizado: "${s}"`);

    if (s.includes('PACIENTE') || s.includes('OCUPADO')) return 'Ocupado';
    if (s.includes('LIVRE') || s.includes('DISPON')) return 'Disponível';
    if (s.includes('HIGIENIZA') || s.includes('LIMPEZA')) return 'Higienização';
    if (s.includes('ALTA')) return 'Alta Confirmada';
    if (s.includes('MANUTEN')) return 'Manutenção';
    if (s.includes('INTERDITADO')) return 'Interditado';
    if (s.includes('RESERVADO')) return 'Reservado';
    
    return rawStatus;
  }

  /** Deriva o emoji visual do status (ex: Manutenção) */
  public static getStatusEmoji(status: string): string | null {
    const s = this.normalizeStatus(status);
    if (s === 'Disponível') return '✅';
    if (s === 'Higienização') return '⏳';
    if (s === 'Manutenção') return '🛠️';
    if (s === 'Interditado') return '🚫';
    if (s === 'Reservado') return '🔒';
    return null;
  }

  /** Verifica se o leito é de isolamento pelo nome ou status */
  public static checkIsolation(bedName: string, status: string): boolean {
    const statusLower = status.toLowerCase();
    return bedName.includes('ISO') || statusLower.includes('isolamento');
  }

  /** Verifica se o paciente teve alta confirmada por data ou status explicitado */
  public static checkDischarge(status: string, rawDtAlta: string | null): boolean {
    if (status === 'Alta Confirmada') return true;
    if (rawDtAlta) {
      try {
        const today = new Date();
        const altaDate = new Date(rawDtAlta);
        if (altaDate.toDateString() === today.toDateString()) return true;
      } catch (_) {}
    }
    return false;
  }

  /** Calcula os dias de permanência do paciente no hospital desde a entrada.
   * Se entrou hoje, retorna 1.
   */
  public static calculateStayDuration(rawDtEntrada: string | null): number {
    if (!rawDtEntrada) return 0;
    try {
      const entradaDate = new Date(rawDtEntrada);
      if (!isNaN(entradaDate.getTime())) {
        const diffMs = Math.abs(Date.now() - entradaDate.getTime());
        return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }
    } catch (_) {}
    return 0;
  }
}
