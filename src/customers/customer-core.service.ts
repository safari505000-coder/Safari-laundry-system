import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export const customerCoreSelect = {
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

