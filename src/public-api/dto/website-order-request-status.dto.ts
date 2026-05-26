import { ApiProperty } from '@nestjs/swagger';
import { WebsiteOrderRequestStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateWebsiteOrderRequestStatusDto {
  @ApiProperty({
    enum: WebsiteOrderRequestStatus,
    enumName: 'WebsiteOrderRequestStatus',
  })
  @IsEnum(WebsiteOrderRequestStatus)
  status: WebsiteOrderRequestStatus;
}
