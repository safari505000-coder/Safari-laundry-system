import { MessageEvent } from "@nestjs/common";
import type { Observable } from "rxjs";
import { ControlTowerService } from './control-tower.service';
import { ControlTowerStreamService } from './control-tower-stream.service';
import { ControlTowerQueryDto } from './dto/control-tower-query.dto';
import type { ControlTowerResponseDto } from './dto/control-tower-response.dto';
export declare class ControlTowerController {
    private readonly controlTower;
    private readonly streamService;
    constructor(controlTower: ControlTowerService, streamService: ControlTowerStreamService);
    snapshot(query: ControlTowerQueryDto): Promise<ControlTowerResponseDto>;
    sse(): Observable<MessageEvent>;
}
