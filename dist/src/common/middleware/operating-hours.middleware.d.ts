import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OperatingHoursService } from '../../system/operating-hours.service';
export declare class OperatingHoursMiddleware implements NestMiddleware {
    private readonly hours;
    constructor(hours: OperatingHoursService);
    use(req: Request, res: Response, next: NextFunction): void;
}
