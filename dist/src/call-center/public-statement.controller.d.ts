import { CallCenterService } from './call-center.service';
export declare class PublicStatementController {
    private readonly callCenter;
    constructor(callCenter: CallCenterService);
    getPublic(token: string): Promise<import("./dto/customer-ledger.dto").CustomerLedgerResponseDto>;
}
