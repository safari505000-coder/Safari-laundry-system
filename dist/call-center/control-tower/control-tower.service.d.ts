import { PrismaService } from '../../prisma/prisma.service';
import { ControlTowerQueryDto } from './dto/control-tower-query.dto';
import type { ControlTowerResponseDto } from './dto/control-tower-response.dto';
export declare class ControlTowerService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getSnapshot(query: ControlTowerQueryDto): Promise<ControlTowerResponseDto>;
    private resolveCreatedAtWindow;
}
