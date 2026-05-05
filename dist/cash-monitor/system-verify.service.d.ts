import { CashClassifierService } from './cash-classifier.service';
import { CashRiskService } from './cash-risk.service';
import { CashExecutiveService } from './cash-executive.service';
import { SystemVerifyResponseDto } from './dto/system-verify.dto';
export declare class SystemVerifyService {
    private readonly classifier;
    private readonly risk;
    private readonly executive;
    constructor(classifier: CashClassifierService, risk: CashRiskService, executive: CashExecutiveService);
    run(): Promise<SystemVerifyResponseDto>;
}
