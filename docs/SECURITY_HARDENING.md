# Security Hardening — MFA, Sessions, Devices, Login History

V10 adds self-service account security for privileged staff, implemented in
`src/account-security/`. It is **additive**: new standalone tables, new
endpoints, and a fully-guarded login event hook. Nothing in the existing auth
flow changed behavior.

## MFA (TOTP, RFC 6238)

- Implemented from scratch with Node `crypto` (`src/account-security/totp.util.ts`)
  — **no third-party dependency**. SHA-1 HOTP, 6 digits, 30s step, ±1 step drift.
- Compatible with Google Authenticator / Authy / 1Password (standard
  `otpauth://totp/...` URI).
- Recovery codes are generated once on activation and stored **SHA-256 hashed**;
  a recovery code is consumed (removed) when used.

### Enrollment lifecycle

```
enroll  ->  PENDING (secret generated, shown once + otpauth URI)
activate (valid TOTP) -> ACTIVE (recovery codes returned once)
disable (valid TOTP / recovery) -> DISABLED
```

## Endpoints

`@Controller('owner/security')`, guarded by `JwtAuthGuard` + `RolesGuard`,
`@Roles(OWNER, ACCOUNTANT)`. Every endpoint acts only on the **caller's own**
account.

| Method & path                                   | Description                  |
| ----------------------------------------------- | ---------------------------- |
| `POST /api/owner/security/mfa/enroll`           | Begin TOTP enrollment        |
| `POST /api/owner/security/mfa/activate`         | Activate with a TOTP code    |
| `POST /api/owner/security/mfa/disable`          | Disable after re-verifying   |
| `GET  /api/owner/security/mfa/status`           | Status + recovery remaining  |
| `GET  /api/owner/security/sessions`             | Active sessions              |
| `DELETE /api/owner/security/sessions/:id`       | Forced logout (one)          |
| `POST /api/owner/security/sessions/revoke-all`  | Forced logout (all)          |
| `GET  /api/owner/security/login-history`        | Recent login attempts        |
| `GET  /api/owner/security/devices`              | Known devices                |
| `POST /api/owner/security/devices/trust`        | Mark device trusted          |
| `POST /api/owner/security/devices/untrust`      | Mark device untrusted        |

## Sessions, devices, login history

- `AuthService` emits `auth.login.succeeded` (guarded, fire-and-forget) on every
  successful authenticated session.
- `AccountSecurityLoginListener` (`@OnEvent`, async) records:
  - a `UserLoginHistory` row (outcome SUCCESS),
  - a `UserDevice` upsert (when a device id is present),
  - a `UserSession` row (linked by SHA-256 of the refresh token).
- **Forced logout** sets `UserSession.revokedAt` / `revokedReason`.

> The emit and the listener are both fully wrapped so a failure in security
> capture can never block or fail a login.

## Audit logging

Every mutation writes to the global, hash-chained `AuditLogsService` with
`resource = "account_security"` and actions such as `MFA_ENROLL_STARTED`,
`MFA_ACTIVATED`, `MFA_DISABLED`, `MFA_ACTIVATE_FAILED`, `SESSION_REVOKED`,
`SESSION_REVOKED_ALL`, `DEVICE_TRUSTED`, `DEVICE_UNTRUSTED`.

## Data model (additive)

Migration `20260601190000_v10_account_security`:

- `UserMfaSecret(userId unique, secret, status, recoveryCodes[], …)`
- `UserSession(userId, tokenHash unique, deviceId, ipAddress, userAgent, revokedAt, …)`
- `UserDevice(userId+deviceId unique, trusted, lastIp, …)`
- `UserLoginHistory(userId, outcome, reason, ipAddress, deviceId, mfaUsed, …)`
- enums `MfaStatus`, `LoginOutcome`

`userId` is a plain scalar (no FK) so the `User` model and the financial
`schema.lock` invariants are untouched.

## Enforcing MFA at login (future, gated)

Today MFA is **opt-in**. To make it mandatory for OWNER/ACCOUNTANT:

1. Add a feature flag (e.g. `MFA_ENFORCED_ROLES`).
2. In the login controller, when `AccountSecurityService.isMfaActive(userId)`
   (or role ∈ `MFA_REQUIRED_ROLES`), require a second step that calls
   `verifyMfaCode(userId, code)` before issuing the full session.
3. Record `MFA_REQUIRED` / `MFA_FAILURE` login-history outcomes.

Ship this as a **separate reviewed PR** with tests and a rollback switch — it
changes the login contract and must not destabilize the live trial.
