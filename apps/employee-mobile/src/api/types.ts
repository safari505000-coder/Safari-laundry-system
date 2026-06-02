/** Staff auth contracts — local to employee-mobile (not shared with web internals). */

export type StaffRole =
  | 'OWNER'
  | 'GENERAL_MANAGER'
  | 'MANAGER'
  | 'DRIVER'
  | 'CALL_CENTER'
  | 'CALL_CENTER_SUPERVISOR'
  | 'FLEET_SUPERVISOR'
  | 'ACCOUNTANT'
  | 'SUPERVISOR'
  | 'VIEWER'
  | 'WORKER'
  | 'CUSTOMER';

export type StaffUser = {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  safariRole: StaffRole;
  branchId?: string | null;
};

export type LoginResponse = {
  requiresPasswordChange?: boolean;
  tempToken?: string;
  accessToken?: string;
  refreshToken?: string;
  user: StaffUser;
};

export type RefreshTokenResponse = {
  accessToken: string;
  refreshToken: string;
};

export type LoginRequest = {
  username: string;
  password: string;
};
