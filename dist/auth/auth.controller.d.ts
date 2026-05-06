import type { Request } from "express";
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { type JwtUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { ChangePasswordBodyDto } from './dto/change-password-body.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
export declare class AuthController {
    private readonly authService;
    private readonly auditLogs;
    constructor(authService: AuthService, auditLogs: AuditLogsService);
    login(dto: LoginDto, req: Request & {
        requestId?: string;
    }): Promise<LoginResponseDto>;
    refresh(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto>;
    logout(dto: RefreshTokenRequestDto, req: Request & {
        requestId?: string;
    }): Promise<void>;
    changePassword(jwtUser: JwtUser, dto: ChangePasswordBodyDto): Promise<LoginResponseDto>;
    private ip;
    private userAgent;
}
