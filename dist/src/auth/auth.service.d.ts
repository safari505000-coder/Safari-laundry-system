import { JwtService } from '@nestjs/jwt';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { BcryptService } from './bcrypt.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly financeService;
    private readonly bcryptService;
    private readonly logger;
    constructor(prisma: PrismaService, jwt: JwtService, financeService: FinanceService, bcryptService: BcryptService);
    login(dto: LoginDto): Promise<LoginResponseDto>;
    refreshAccessToken(rawToken: string): Promise<RefreshTokenResponseDto>;
    revokeRefreshToken(rawToken: string): Promise<void>;
    private issueRefreshToken;
    private recordOutsideHoursAudit;
}
