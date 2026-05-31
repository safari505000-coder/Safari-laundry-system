import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateOrderQuickDto } from './dto/create-order-quick.dto';

/**
 * Phase 4 extraction — customer resolution for order creation (lookup by any
 * phone, and quick-order resolve/create/update).
 *
 * `*Tx` pattern: every method operates ONLY on the `tx` passed by the caller.
 * This service NEVER opens its own `$transaction` and NEVER touches a Prisma
 * client directly — OrdersService stays the transaction owner.
 */
@Injectable()
export class OrderCustomerResolverService {

  async findCustomerByAnyPhoneTx(
    tx: Prisma.TransactionClient,
    phoneCompact: string,
  ) {
    return tx.customer.findFirst({
      where: {
        OR: [{ phone: phoneCompact }, { phone2: phoneCompact }],
      },
    });
  }

  async resolveQuickOrderCustomerIdTx(
    tx: Prisma.TransactionClient,
    dto: CreateOrderQuickDto,
    phoneCompact: string,
  ): Promise<string> {
    if (dto.customerId) {
      const existing = await tx.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!existing) {
        throw new NotFoundException('Customer not found');
      }
      const existingCompact = existing.phone.replace(/[\s-]/g, '').trim();
      const existingCompact2 = existing.phone2?.replace(/[\s-]/g, '').trim();
      if (existingCompact !== phoneCompact && existingCompact2 !== phoneCompact) {
        throw new BadRequestException(
          'customerPhone does not match the selected customer',
        );
      }
      const name = dto.customerDisplayName?.trim();
      if (name) {
        await tx.customer.update({
          where: { id: existing.id },
          data: { displayName: name },
        });
      }
      return existing.id;
    }
    const existingByPhone = await this.findCustomerByAnyPhoneTx(tx, phoneCompact);
    const customer =
      existingByPhone ?
        await tx.customer.update({
          where: { id: existingByPhone.id },
          data: {
            displayName:
              dto.customerDisplayName?.trim() || existingByPhone.displayName,
            address: dto.customerAddress?.trim() || existingByPhone.address,
          },
        })
      : await tx.customer.create({
          data: {
            phone: phoneCompact,
            address: dto.customerAddress?.trim() || null,
            displayName: dto.customerDisplayName?.trim() || null,
          },
        });
    return customer.id;
  }
}
