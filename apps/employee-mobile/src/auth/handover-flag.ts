import * as SecureStore from 'expo-secure-store';

const HANDOVER_FLAG_TTL_MS = 24 * 60 * 60 * 1000;

function handoverKey(userId: string): string {
  return `safari.driverCustody.lastHandover.${userId}`;
}

export async function readHandoverFlag(
  userId: string | undefined,
): Promise<string | null> {
  if (!userId) {
    return null;
  }
  try {
    const raw = await SecureStore.getItemAsync(handoverKey(userId));
    if (!raw) {
      return null;
    }
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) {
      await SecureStore.deleteItemAsync(handoverKey(userId));
      return null;
    }
    if (Date.now() - ts > HANDOVER_FLAG_TTL_MS) {
      await SecureStore.deleteItemAsync(handoverKey(userId));
      return null;
    }
    return new Date(ts).toISOString();
  } catch {
    return null;
  }
}

export async function writeHandoverFlag(
  userId: string | undefined,
  iso: string | null,
): Promise<void> {
  if (!userId) {
    return;
  }
  try {
    if (iso) {
      await SecureStore.setItemAsync(handoverKey(userId), iso);
    } else {
      await SecureStore.deleteItemAsync(handoverKey(userId));
    }
  } catch {
    /* secure store unavailable */
  }
}
