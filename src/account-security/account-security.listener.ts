import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountSecurityService } from './account-security.service';
import { AUTH_LOGIN_SUCCEEDED, AuthLoginSucceededEvent } from './account-security.events';

/**
 * Captures real authentication events emitted by AuthService into the
 * login-history / device / session tables. Fully decoupled and async so it
 * can never affect the login response path.
 */
@Injectable()
export class AccountSecurityLoginListener {
  constructor(private readonly accountSecurity: AccountSecurityService) {}

  @OnEvent(AUTH_LOGIN_SUCCEEDED, { async: true, promisify: true })
  async onLoginSucceeded(event: AuthLoginSucceededEvent): Promise<void> {
    await this.accountSecurity.recordSuccessfulLogin(event);
  }
}
