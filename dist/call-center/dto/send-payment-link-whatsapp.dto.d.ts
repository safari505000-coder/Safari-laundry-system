import type { ReminderResultDto } from './reminder-result.dto';
export type SendPaymentLinkWhatsappResultDto = {
    reminder: ReminderResultDto;
    serverPush: boolean;
    paymentUrl: string;
};
