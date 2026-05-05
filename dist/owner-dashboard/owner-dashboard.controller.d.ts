import { OwnerDashboardCacheResponseDto } from './dto/owner-dashboard-response.dto';
import { OwnerDashboardService } from './owner-dashboard.service';
export declare class OwnerDashboardController {
    private readonly dashboard;
    constructor(dashboard: OwnerDashboardService);
    getDashboard(): Promise<OwnerDashboardCacheResponseDto>;
}
