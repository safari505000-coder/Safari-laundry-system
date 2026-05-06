import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { type JwtUser } from '../../auth/decorators/current-user.decorator';
import { OutstandingExportService } from './outstanding-export.service';
import { OutstandingQueryDto } from './dto/outstanding-query.dto';
import { CustomerCollectionStatusDto, UpdateCustomerCollectionStatusDto } from './dto/update-customer-collection-status.dto';
import { OutstandingResponseDto } from './dto/outstanding-row.dto';
import { OutstandingService } from './outstanding.service';
export declare class OutstandingController {
    private readonly outstanding;
    private readonly exporter;
    constructor(outstanding: OutstandingService, exporter: OutstandingExportService);
    list(query: OutstandingQueryDto, user: JwtUser | undefined): Promise<OutstandingResponseDto>;
    export(body: OutstandingQueryDto, query: OutstandingQueryDto, user: JwtUser | undefined, res: Response): Promise<StreamableFile>;
    getStatus(customerId: string): Promise<CustomerCollectionStatusDto>;
    patchStatus(customerId: string, body: UpdateCustomerCollectionStatusDto, user: JwtUser | undefined): Promise<CustomerCollectionStatusDto>;
}
