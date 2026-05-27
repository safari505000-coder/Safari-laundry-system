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

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

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

    const ttl =
      (process.env.CUSTOMER_PORTAL_TOKEN_TTL?.trim() as `${number}d`) ||
      '3650d';
    const payload: JwtPayload = {
      sub: customer.id,
      role: SafariRole.CUSTOMER,
      linkedCustomerId: customer.id,
      tokenPurpose: 'CUSTOMER_PORTAL',
    };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttl });

    this.logger.log(
      `Customer portal OTP verified for ${normalized.slice(0, 2)}****`,
    );

    return {
      status: 'VERIFIED' as const,
      accessToken,
      expiresIn: ttl,
      customer: {
        id: customer.id,
        phone: customer.phone,
        displayName: customer.displayName,
      },
    };
  }
}
