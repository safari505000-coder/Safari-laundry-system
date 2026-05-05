import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { DriverOversightCard, DriverOversightService } from './driver-oversight.service';
export declare class DriverOversightController {
    private readonly svc;
    private readonly logger;
    constructor(svc: DriverOversightService);
    list(user: JwtUser): Promise<DriverOversightCard[]>;
    private assertNoForbiddenCashFields;
}
