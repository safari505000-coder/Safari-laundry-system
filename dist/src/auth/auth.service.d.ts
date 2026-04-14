import { JwtService } from '@nestjs/jwt';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwt;
    private readonly financeService;
    constructor(prisma: PrismaService, jwt: JwtService, financeService: FinanceService);
    login(dto: LoginDto): Promise<LoginResponseDto>;
}
