import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/**
 * تعديل بيانات الموظف — جميع حقول إنشاء المستخدم اختيارية.
 * Update-user DTO — all CreateUserDto fields are optional for partial updates.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
