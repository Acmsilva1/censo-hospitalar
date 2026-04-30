import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';
export declare class CensoController {
    private censoService;
    constructor();
    getHealth: (req: Request, res: Response) => void;
    getHospitals: (req: Request, res: Response) => void;
    manualRefresh: (req: Request, res: Response) => Promise<void>;
    handleSocketConnection: (socket: Socket) => void;
}
//# sourceMappingURL=CensoController.d.ts.map