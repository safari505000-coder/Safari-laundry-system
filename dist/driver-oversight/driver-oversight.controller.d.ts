import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { DriverOversightService } from './driver-oversight.service';
export declare class DriverOversightController {
    private readonly svc;
    constructor(svc: DriverOversightService);
    list(user: JwtUser): Promise<import("./driver-oversight.service").DriverOversightCard[]>;
}
