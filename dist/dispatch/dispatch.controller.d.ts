import { MessageEvent } from "@nestjs/common";
import type { Dispatch } from "@prisma/client";
import { Observable } from "rxjs";
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { DispatchDriverDto } from './dto/dispatch-driver.dto';
import { DispatchRowDto, DispatchSnapshotDto } from './dto/dispatch-row.dto';
import { DispatchMonitorSnapshotDto } from './dto/dispatch-monitor.dto';
import { ReassignDispatchDto } from './dto/reassign-dispatch.dto';
import { DispatchService } from './dispatch.service';
export declare class DispatchController {
    private readonly dispatch;
    constructor(dispatch: DispatchService);
    create(dto: CreateDispatchDto, user: JwtUser): Promise<DispatchRowDto>;
    listActive(limitRaw?: string): Promise<DispatchSnapshotDto>;
    listDrivers(): Promise<DispatchDriverDto[]>;
    monitor(): Promise<DispatchMonitorSnapshotDto>;
    reassign(id: string, dto: ReassignDispatchDto, user: JwtUser): Promise<Dispatch>;
    listMine(user: JwtUser): Promise<DispatchSnapshotDto>;
    pollMine(user: JwtUser): Promise<DispatchSnapshotDto>;
    acknowledge(id: string, user: JwtUser): Promise<DispatchRowDto>;
    stream(user: JwtUser): Observable<MessageEvent>;
}
