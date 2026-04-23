import { SystemToggleKey } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class UpdateToggleDto {
  @IsEnum(SystemToggleKey)
  key!: SystemToggleKey;

  @IsBoolean()
  isEnabled!: boolean;
}
