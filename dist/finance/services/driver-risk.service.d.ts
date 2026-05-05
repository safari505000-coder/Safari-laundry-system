import type { RiskyDriverDto } from '../dto/owner-financial-dashboard.dto';
import { PrismaService } from '../../prisma/prisma.service';
export declare class DriverRiskService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getRiskyDrivers(take?: number): Promise<RiskyDriverDto[]>;
}
