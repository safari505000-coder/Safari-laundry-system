import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SafariRole } from '@prisma/client';
import * as crypto from 'node:crypto';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { JWT_SECRET_DEV_FALLBACK } from '../common/constants/jwt-secret-fallback';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  generateRefreshTokenRaw,
  sha256Hex,
} from '../common/auth/refresh-token.util';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const CUSTOMER_REFRESH_TOKEN_DAYS = Number.parseInt(
  process.env.CUSTOMER_REFRESH_TOKEN_DAYS ?? '30',
  10,
);

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '').trim();
}

function hashOtpCode(code: string): string {
  const secret = process.env.JWT_SECRET ?? JWT_SECRET_DEV_FALLBACK;
  return crypto.createHash('sha256').update(`${secret}:${code}`).digest('hex');
}

function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function isDevOtpEchoEnabled(): boolean {
  const v = process.env.CUSTOMER_OTP_DEV_ECHO?.trim().toLowerCase() ?? '';
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

function isCustomerPortalPhonePreviewEnabled(): boolean {
  const v =
    process.env.PUBLIC_CUSTOMER_PORTAL_PHONE_PREVIEW?.trim().toLowerCase() ??
    '';
  if (v === 'false' || v === '0' || v === 'off') {
    return false;
  }
  if (v === 'true' || v === '1' || v === 'on') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function isCustomerPortalDevLoginEnabled(): boolean {
  const v =
    process.env.CUSTOMER_PORTAL_DEV_LOGIN?.trim().toLowerCase() ?? '';
  if (v === 'false' || v === '0' || v === 'off') {
    return false;
  }
  if (v === 'true' || v === '1' || v === 'on') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

@Injectable()
export class CustomerPortalAuthService {
  private readonly logger = new Logger(CustomerPortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly customerNotifications: CustomerNotificationsService,
  ) {}

  static phonePreviewEnabled(): boolean {
    return isCustomerPortalPhonePreviewEnabled();
  }

  static devLoginEnabled(): boolean {
    return isCustomerPortalDevLoginEnabled();
  }

  async requestOtp(phone: string) {
    const normalized = normalizePhone(phone);
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: normalized }, { phone2: normalized }] },
      select: { id: true },
    });

    const recent = await this.prisma.customerPortalOtpChallenge.findFirst({
      where: {
        phone: normalized,
        consumedAt: null,
        createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      throw new BadRequestException(
        'انتظر دقيقة قبل طلب رمز جديد.',
      );
    }

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.customerPortalOtpChallenge.create({
      data: {
        phone: normalized,
        codeHash: hashOtpCode(code),
        expiresAt,
      },
    });

    const message = `رمز الدخول إلى سفاري: ${code}\nصالح لمدة 10 دقائق.`;
    const sent = await this.customerNotifications.sendCustomerPlainWhatsApp(
      normalized,
      message,
    );

    const response: {
      status: 'OTP_SENT' | 'OTP_PENDING';
      customerExists: boolean;
      message: string;
      delivery?: 'whatsapp' | 'dev';
      devOtpCode?: string;
    } = {
      status: sent ? 'OTP_SENT' : 'OTP_PENDING',
      customerExists: Boolean(customer),
      message: sent
        ? 'تم إرسال رمز الدخول على واتساب.'
        : 'تعذر إرسال واتساب حالياً. حاول لاحقاً أو تواصل مع مركز الاتصال.',
    };

    if (sent) {
      response.delivery = 'whatsapp';
    } else if (isDevOtpEchoEnabled()) {
      response.delivery = 'dev';
      response.devOtpCode = code;
      response.message =
        'وضع التطوير — استخدم الرمز الظاهر لإكمال الدخول (WhatsApp غير متصل).';
    }

    if (!customer && !isDevOtpEchoEnabled()) {
      response.message =
        'إذا كان رقمك مسجلاً لدينا، ستصلك رسالة واتساب. للعملاء الجدد، أنشئ طلباً أولاً.';
    }

    return response;
  }

  async verifyOtp(phone: string, code: string) {
    const normalized = normalizePhone(phone);
    const challenge = await this.prisma.customerPortalOtpChallenge.findFirst({
      where: {
        phone: normalized,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new UnauthorizedException('لا يوجد رمز نشط — اطلب رمزاً جديداً.');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('انتهت صلاحية الرمز — اطلب رمزاً جديداً.');
    }
    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new UnauthorizedException(
        'تجاوزت عدد المحاولات — اطلب رمزاً جديداً.',
      );
    }

    const valid = hashOtpCode(code) === challenge.codeHash;
    if (!valid) {
      await this.prisma.customerPortalOtpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('رمز غير صحيح.');
    }

    await this.prisma.customerPortalOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    this.logger.log(
      `Customer portal OTP verified for ${normalized.slice(0, 2)}****`,
    );

    return this.issueCustomerPortalSession(normalized);
  }

  async devLoginByPhone(phone: string) {
    if (!isCustomerPortalDevLoginEnabled()) {
      throw new UnauthorizedException(
        'Dev login is disabled — use OTP login.',
      );
    }

    const normalized = normalizePhone(phone);
    this.logger.warn(
      `Customer portal DEV login for ${normalized.slice(0, 2)}****`,
    );

    return this.issueCustomerPortalSession(normalized);
  }

  async refreshCustomerAccessToken(rawToken: string) {
    const tokenHash = sha256Hex(rawToken);
    const row = await this.prisma.customerRefreshToken.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });
    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (row.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (row.usedAt) {
      await this.prisma.customerRefreshToken.updateMany({
        where: { customerId: row.customerId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Customer refresh-token replay detected for customer ${row.customerId}; revoking all sessions.`,
      );
      throw new UnauthorizedException('Refresh token replay detected');
    }

    const accessToken = await this.issueCustomerAccessToken(row.customerId);
    const newRaw = generateRefreshTokenRaw();
    const newHash = sha256Hex(newRaw);
    const newExpiresAt = new Date(
      Date.now() + CUSTOMER_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerRefreshToken.create({
        data: {
          customerId: row.customerId,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
        },
      });
      await tx.customerRefreshToken.update({
        where: { id: row.id },
        data: {
          usedAt: new Date(),
          replacedById: created.id,
        },
      });
    });

    return { accessToken, refreshToken: newRaw };
  }

  async revokeCustomerRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    await this.prisma.customerRefreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private async issueCustomerPortalSession(normalized: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { OR: [{ phone: normalized }, { phone2: normalized }] },
      select: {
        id: true,
        phone: true,
        displayName: true,
      },
    });
    if (!customer) {
      throw new NotFoundException(
        'لم يُعثر على حساب لهذا الرقم. أنشئ طلب خدمة أولاً.',
      );
    }

    const ttl = this.customerAccessTokenTtl();
    const accessToken = await this.issueCustomerAccessToken(customer.id);
    const refreshToken = await this.issueCustomerRefreshToken(customer.id);

    return {
      status: 'VERIFIED' as const,
      accessToken,
      refreshToken,
      expiresIn: ttl,
      customer: {
        id: customer.id,
        phone: customer.phone,
        displayName: customer.displayName,
      },
    };
  }

  private customerAccessTokenTtl(): any {
    // Keep the rollout backward-compatible until customer-mobile stores and
    // rotates refresh tokens; operators can shorten via env after client uptake.
    return process.env.CUSTOMER_PORTAL_TOKEN_TTL?.trim() || '30d';
  }

  private async issueCustomerAccessToken(customerId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: customerId,
      role: SafariRole.CUSTOMER,
      linkedCustomerId: customerId,
      tokenPurpose: 'CUSTOMER_PORTAL',
    };
    return this.jwt.signAsync(payload, {
      expiresIn: this.customerAccessTokenTtl(),
    });
  }

  private async issueCustomerRefreshToken(customerId: string): Promise<string> {
    const raw = generateRefreshTokenRaw();
    const tokenHash = sha256Hex(raw);
    const expiresAt = new Date(
      Date.now() + CUSTOMER_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.prisma.customerRefreshToken.create({
      data: { customerId, tokenHash, expiresAt },
    });
    return raw;
  }
}
