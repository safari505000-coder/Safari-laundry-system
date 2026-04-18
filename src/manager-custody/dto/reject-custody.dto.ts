import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Accountant rejection of a manager custody bag — returns it to PENDING_DEPOSIT. */
export class RejectCustodyDto {
  @ApiProperty({ example: 'Slip amount does not match counted cash.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  rejectionReason: string;
}
