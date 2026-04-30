import type { ICensoRepository, PatientRecord, AvailabilityMap, ComplementMap } from './ICensoRepository.js';
export declare class CsvCensoRepository implements ICensoRepository {
    private readonly dataDir;
    private readonly masterFilePath;
    private readonly availabilityFilePath;
    private readonly ocupacaoFilePath;
    private readonly complementFilePath;
    private readonly UNIT_ID_REMAP;
    /** Preferência: `.parquet` na mesma pasta, senão `.csv` (só leitura). */
    private resolveExisting;
    constructor(dataDir?: string);
    getMasterFilePath(): string;
    private isCsvFile;
    private normalizeBedName;
    private normalizeSectorName;
    private normalizeTipoName;
    private normalizeTypeName;
    /**
     * Retorna mapa de pacientes por vínculo geográfico (Setor_Leito).
     * Fonte: vw_taxa_ocupacao_com_pacientes.csv
     */
    getPatients(): Promise<Map<string, PatientRecord>>;
    /**
     * Retorna disponibilidade dos leitos.
     * Fonte: tbl_ocupacao_internacao.csv
     * Filtro: IE_SITUACAO = 'A' (anti-fantasma)
     */
    getAvailability(): Promise<AvailabilityMap>;
    /**
     * Retorna dados clínicos complementares.
     * Fonte: tbl_intern_internacoes.csv
     */
    getComplement(): Promise<ComplementMap>;
}
//# sourceMappingURL=CsvCensoRepository.d.ts.map