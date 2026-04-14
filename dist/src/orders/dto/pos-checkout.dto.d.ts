import { PosPaymentMethod } from '@prisma/client';
import { CreateOrderQuickDto } from './create-order-quick.dto';
export declare class PosCheckoutDto extends CreateOrderQuickDto {
    posPaymentMethod?: PosPaymentMethod;
}
