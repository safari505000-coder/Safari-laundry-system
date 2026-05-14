import { PartialType } from '@nestjs/swagger';
import { CreateCommissionRuleDto } from './create-commission-rule.dto';

/**
 * تعديل قاعدة عمولة — جميع حقول إنشاء القاعدة اختيارية.
 * Update commission-rule DTO — all fields from CreateCommissionRuleDto are optional.
 */
export class UpdateCommissionRuleDto extends PartialType(
  CreateCommissionRuleDto,
) {}
