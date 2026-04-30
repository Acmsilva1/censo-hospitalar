export declare class BedStatusService {
    /** Deriva o emoji de gênero do paciente baseado no sexo */
    static getPatientEmoji(sex?: string | null): string | null;
    /** Normaliza os termos técnicos do Tasy para o domínio amigável da aplicação */
    static normalizeStatus(rawStatus: string): string;
    /** Deriva o emoji visual do status (ex: Manutenção) */
    static getStatusEmoji(status: string): string | null;
    /** Verifica se o leito é de isolamento pelo nome ou status */
    static checkIsolation(bedName: string, status: string): boolean;
    /** Verifica se o paciente teve alta confirmada por data ou status explicitado */
    static checkDischarge(status: string, rawDtAlta: string | null): boolean;
    /** Calcula os dias de permanência do paciente no hospital desde a entrada.
     * Se entrou hoje, retorna 1.
     */
    static calculateStayDuration(rawDtEntrada: string | null): number;
}
//# sourceMappingURL=BedStatusService.d.ts.map