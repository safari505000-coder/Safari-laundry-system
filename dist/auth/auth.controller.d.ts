import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<LoginResponseDto>;
    refresh(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto>;
    logout(dto: RefreshTokenRequestDto): Promise<void>;
}
