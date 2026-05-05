import { SetMetadata } from '@nestjs/common';
import { AppPermission } from './permissions.enum';

export const PERMISSIONS_KEY = 'safariPermissions';

export const Permissions = (...permissions: AppPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
