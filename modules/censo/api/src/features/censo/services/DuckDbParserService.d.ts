import type { ParseResult } from '../models/Censo.js';
export declare class DuckDbParserService {
    private dataSource;
    constructor();
    parseDataset(): Promise<ParseResult>;
    private sortBeds;
    private calculateStats;
}
//# sourceMappingURL=DuckDbParserService.d.ts.map