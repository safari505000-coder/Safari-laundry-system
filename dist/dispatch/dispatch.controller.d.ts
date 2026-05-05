import { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import type { JwtUser } from '../auth/decorators/current-user.decorator';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { DispatchRowDto, DispatchSnapshotDto } from './dto/dispatch-row.dto';
import { ReassignDispatchDto } from './dto/reassign-dispatch.dto';
import type { Dispatch } from "@prisma/client";
import { DispatchService } from './dispatch.service';
export declare class DispatchController {
    private readonly dispatch;
    constructor(dispatch: DispatchService);
    create(dto: CreateDispatchDto, user: JwtUser): Promise<DispatchRowDto>;
    listActive(limitRaw?: string): Promise<DispatchSnapshotDto>;
    reassign(id: string, dto: ReassignDispatchDto, user: JwtUser): Promise<Dispatch>;
    listMine(user: JwtUser): Promise<DispatchSnapshotDto>;
    pollMine(user: JwtUser): Promise<DispatchSnapshotDto>;
    stream(user: JwtUser): Observable<MessageEvent>;
}
