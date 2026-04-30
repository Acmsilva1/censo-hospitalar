import type { ParseResult } from '../models/Censo.js';
import type { ICensoRepository } from '../repositories/ICensoRepository.js';
export declare class CsvParserService {
    private repository;
    private masterFilePath;
    constructor(repository: ICensoRepository);
    parseDataset(): Promise<ParseResult>;
}
//# sourceMappingURL=CsvParserService.d.ts.map