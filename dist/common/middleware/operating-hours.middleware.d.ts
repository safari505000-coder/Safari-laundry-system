import { NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response, NextFunction } from "express";
import { OperatingHoursService } from '../../system/operating-hours.service';
import { PrismaService } from '../../prisma/prisma.service';
export declare class OperatingHoursMiddleware implements NestMiddleware {
    private readonly hours;
    private readonly jwt;
    private readonly prisma;
    private readonly logger;
    constructor(hours: OperatingHoursService, jwt: JwtService, prisma: PrismaService);
    use(req: Request, res: Response, next: NextFunction): void;
    private tryDecodeOwner;
    private recordMasterOverrideAudit;
}
