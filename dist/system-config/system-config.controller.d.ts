import { type JwtUser } from '../auth/decorators/current-user.decorator';
import { SystemConfigResponseDto, UpdateSystemConfigDto } from './dto/system-config.dto';
import { SystemConfigService } from './system-config.service';
export declare class SystemConfigController {
    private readonly service;
    constructor(service: SystemConfigService);
    read(user: JwtUser): Promise<SystemConfigResponseDto>;
    update(dto: UpdateSystemConfigDto, user: JwtUser): Promise<SystemConfigResponseDto>;
    private assertOwner;
}
