import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const customerSelect = {
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
  wallet: {
    select: {
      balance: true,
      debt: true,
    },
  },
} satisfies Prisma.CustomerSelect;

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
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query?: string) {
    const q = (query ?? '').trim();
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
      select: customerSelect,
    });
  }

  async update(id: string, dto: UpdateCustomerDto) {
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
      ...(dto.motherContact !== undefined
        ? { motherContact: dto.motherContact }
        : {}),
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
      select: customerSelect,
    });
  }
}
