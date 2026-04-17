import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** PermissionsModule: institutional Role↔Permission rows for JWT `role` + RolesGuard; keeps DRIVER / CALL_CENTER out of 403 on guarded staff routes. */
@Module({
  imports: [AuthModule, PermissionsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
