export interface PatientRecord {
    name: string;
    attendanceId?: string;
}
export interface AvailabilityRecord {
    status: string;
    patientId: string | null;
    dtAltaMedico: string | null;
    dtEntrada: string | null;
}
export interface ComplementRecord {
    age: string;
    sex: string;
    name: string;
    dtAltaMedico?: string | null;
    dtEntrada?: string | null;
}
/** Mapa de vínculo geográfico: chave = "SETOR_LEITO" */
export type PatientMap = Map<string, PatientRecord>;
/** Mapa de disponibilidade: chave = "HOSPITAL_SETOR_LEITO" */
export type AvailabilityMap = Map<string, AvailabilityRecord>;
/** Mapa de complemento clínico: chave = NR_ATENDIMENTO */
export type ComplementMap = Map<string, ComplementRecord>;
export interface ICensoRepository {
    /**
     * Retorna o mapa de pacientes por Leito/Setor (vínculo geográfico).
     * Fonte atual: ocupacao.csv → futuro: VIEW_OCUPACAO no PostgreSQL
     */
    getPatients(): Promise<PatientMap>;
    /**
     * Retorna a disponibilidade e status dos leitos.
     * Fonte atual: dataset_censo.csv → futuro: VIEW_CENSO no PostgreSQL
     * Regra: apenas registros com IE_SITUACAO = 'A'
     */
    getAvailability(): Promise<AvailabilityMap>;
    /**
     * Retorna dados clínicos complementares do paciente.
     * Fonte atual: complemento.csv → futuro: VIEW_COMPLEMENTO no PostgreSQL
     */
    getComplement(): Promise<ComplementMap>;
}
//# sourceMappingURL=ICensoRepository.d.ts.map