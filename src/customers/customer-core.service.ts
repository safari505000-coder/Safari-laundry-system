import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseKuwaitMobile965 } from '../common/validation/kuwait-customer-phone';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const customerCoreSelect = {
  id: true,
  phone: true,
  phone2: true,
  displayName: true,
  address: true,
  addressArea: true,
  addressBlock: true,
  addressStreet: true,
  addressAvenue: true,
  addressHouse: true,
  motherContact: true,
  wifeContact: true,
  sonContact: true,
  originBranchId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

export type CustomerCoreRow = Prisma.CustomerGetPayload<{
  select: typeof customerCoreSelect;
}>;

function isNumericQuery(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function composeAddressLine(dto: UpdateCustomerDto): string | null {
  const parts = [
    dto.addressArea,
    dto.addressBlock,
    dto.addressStreet,
    dto.addressAvenue,
    dto.addressHouse,
  ].filter((x): x is string => Boolean(x?.trim()));
  return parts.length ? parts.join(' · ') : null;
}

@Injectable()
export class CustomerCoreService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query?: string): Promise<CustomerCoreRow[]> {
    const q = (query ?? '').trim();
    if (q.length >= 2 && isNumericQuery(q)) {
      return this.listByPhonePriority(q);
    }
    return this.prisma.customer.findMany({
      where:
        q.length < 2
          ? undefined
          : {
              OR: [
                { phone: { contains: q, mode: 'insensitive' } },
                { phone2: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { motherContact: { contains: q, mode: 'insensitive' } },
                { wifeContact: { contains: q, mode: 'insensitive' } },
                { sonContact: { contains: q, mode: 'insensitive' } },
              ],
            },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: customerCoreSelect,
    });
  }

  async listByPhonePriority(query: string): Promise<CustomerCoreRow[]> {
    const q = query.trim();
    if (q.length < 2) {
      return this.list();
    }
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { phone: { contains: q, mode: 'insensitive' } },
          { phone2: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      select: customerCoreSelect,
    });
  }

  async getById(id: string): Promise<CustomerCoreRow | null> {
    return this.prisma.customer.findUnique({
      where: { id },
      select: customerCoreSelect,
    });
  }

  /**
   * Digit variants for PBX / CTI caller-id (965xxxxxxxx, 5xxxxxxx, 00965…).
   * Used with `contains` so DB values like `965…` still match local `5…`.
   */
  incomingPhoneSearchTerms(raw: string): string[] {
    const d = raw.replace(/\D/g, '');
    const terms = new Set<string>();
    if (d.length < 4) {
      return [];
    }
    terms.add(d);
    let rest = d;
    if (rest.startsWith('00965')) {
      rest = rest.slice(5);
    } else if (rest.startsWith('965')) {
      rest = rest.slice(3);
    } else if (rest.startsWith('00')) {
      rest = rest.replace(/^0+/, '') || rest;
    }
    if (rest.length >= 4 && rest !== d) {
      terms.add(rest);
    }
    if (rest.length === 8 && /^\d{8}$/.test(rest)) {
      terms.add(rest);
      terms.add(`965${rest}`);
    }
    return [...terms].filter((t) => t.length >= 4 && t.length <= 16);
  }

  /**
   * PBX «رقم المتصل» — OR match on phone / phone2 for any search term.
   */
  async findByIncomingPhoneRaw(raw: string): Promise<CustomerCoreRow[]> {
    const terms = this.incomingPhoneSearchTerms(raw);
    if (terms.length === 0) {
      return [];
    }
    const or: Prisma.CustomerWhereInput[] = [];
    for (const t of terms) {
      or.push({ phone: { contains: t, mode: 'insensitive' } });
      or.push({ phone2: { contains: t, mode: 'insensitive' } });
    }
    return this.prisma.customer.findMany({
      where: { OR: or },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: customerCoreSelect,
    });
  }

  /**
   * Minimal create for Call Center / CTI handoff (canonical 965… when valid Kuwait mobile).
   */
  async createQuickCustomer(displayName: string, phoneRaw: string): Promise<CustomerCoreRow> {
    const name = displayName.trim();
    if (name.length < 1) {
      throw new BadRequestException('displayName is required');
    }
    const compact = phoneRaw.replace(/[\s-]/g, '').trim();
    if (compact.length < 8) {
      throw new BadRequestException('Valid Kuwait mobile phone is required');
    }
    const dupes = await this.findByIncomingPhoneRaw(compact);
    if (dupes.length > 0) {
      throw new ConflictException('A customer with this phone already exists');
    }
    const phone = parseKuwaitMobile965(compact) ?? compact;
    return this.prisma.customer.create({
      data: {
        displayName: name,
        phone,
      },
      select: customerCoreSelect,
    });
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerCoreRow> {
    const addressLine = composeAddressLine(dto);
    const data: Prisma.CustomerUpdateInput = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.phone2 !== undefined ? { phone2: dto.phone2 } : {}),
      ...(dto.addressArea !== undefined ? { addressArea: dto.addressArea } : {}),
      ...(dto.addressBlock !== undefined ? { addressBlock: dto.addressBlock } : {}),
      ...(dto.addressStreet !== undefined ? { addressStreet: dto.addressStreet } : {}),
      ...(dto.addressAvenue !== undefined ? { addressAvenue: dto.addressAvenue } : {}),
      ...(dto.addressHouse !== undefined ? { addressHouse: dto.addressHouse } : {}),
      ...(dto.motherContact !== undefined ? { motherContact: dto.motherContact } : {}),
      ...(dto.wifeContact !== undefined ? { wifeContact: dto.wifeContact } : {}),
      ...(dto.sonContact !== undefined ? { sonContact: dto.sonContact } : {}),
    };
    if (
      dto.addressArea !== undefined ||
      dto.addressBlock !== undefined ||
      dto.addressStreet !== undefined ||
      dto.addressAvenue !== undefined ||
      dto.addressHouse !== undefined
    ) {
      data.address = addressLine;
    }
    return this.prisma.customer.update({
      where: { id },
      data,
      select: customerCoreSelect,
    });
  }
}

