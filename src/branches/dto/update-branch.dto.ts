import { PartialType } from '@nestjs/swagger';
import { CreateBranchDto } from './create-branch.dto';

/**
 * V19.21 — all fields optional so the Owner can tweak a single
 * column (e.g. toggle `isActive`, change a phone) without being
 * forced to resend the full row. Extends `CreateBranchDto` so the
 * same `class-validator` rules (trim / length caps) apply whenever
 * a field IS present.
 */
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}
