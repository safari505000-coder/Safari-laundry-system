import { ExpoPushService, isExpoPushToken } from './expo-push.service';
import { websiteOrderStatusPushCopy } from './website-order-push-copy';

describe('websiteOrderStatusPushCopy', () => {
  it('maps actionable statuses to Arabic customer copy', () => {
    expect(websiteOrderStatusPushCopy('CONTACTED', 'W-00042')?.body).toContain(
      'W-00042',
    );
    expect(websiteOrderStatusPushCopy('NEW', 'W-00042')).toBeNull();
  });
});

describe('isExpoPushToken', () => {
  it('accepts standard Expo token shapes', () => {
    expect(isExpoPushToken('ExponentPushToken[abc-123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc-123]')).toBe(true);
    expect(isExpoPushToken('not-a-token')).toBe(false);
  });
});

describe('ExpoPushService', () => {
  const originalMock = process.env.EXPO_PUSH_MOCK;
  const originalEnabled = process.env.EXPO_PUSH_ENABLED;

  afterEach(() => {
    process.env.EXPO_PUSH_MOCK = originalMock;
    process.env.EXPO_PUSH_ENABLED = originalEnabled;
  });

  it('logs mock pushes without calling Expo when EXPO_PUSH_MOCK=true', async () => {
    process.env.EXPO_PUSH_MOCK = 'true';
    process.env.EXPO_PUSH_ENABLED = 'true';
    const service = new ExpoPushService();
    const ok = await service.sendToToken('ExponentPushToken[unit-test]', {
      title: 'Test',
      body: 'Hello',
    });
    expect(ok).toBe(true);
  });

  it('skips send when EXPO_PUSH_ENABLED=false', async () => {
    process.env.EXPO_PUSH_MOCK = 'false';
    process.env.EXPO_PUSH_ENABLED = 'false';
    const service = new ExpoPushService();
    const ok = await service.sendToToken('ExponentPushToken[unit-test]', {
      title: 'Test',
      body: 'Hello',
    });
    expect(ok).toBe(false);
  });
});
