import * as SecureStore from 'expo-secure-store';

const PHONE_KEY = 'safari_customer_phone';
const ACCESS_TOKEN_KEY = 'safari_customer_access_token';
const SAVED_ADDRESS_KEY = 'safari_customer_saved_address';
const SAVED_ADDRESSES_KEY = 'safari_customer_saved_addresses';
const FAVORITE_SERVICES_KEY = 'safari_customer_favorite_services';
const ONBOARDING_DONE_KEY = 'safari_customer_onboarding_done';
const RATED_ORDER_IDS_KEY = 'safari_customer_rated_order_ids';

export async function readSavedPhone(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PHONE_KEY);
  } catch {
    return null;
  }
}

export async function writeSavedPhone(phone: string | null): Promise<void> {
  if (!phone) {
    await SecureStore.deleteItemAsync(PHONE_KEY);
    return;
  }
  await SecureStore.setItemAsync(PHONE_KEY, phone);
}

export async function readSavedAddress(): Promise<string | null> {
  try {
    const addresses = await readSavedAddresses();
    if (addresses.length > 0) {
      return addresses[0];
    }
    return await SecureStore.getItemAsync(SAVED_ADDRESS_KEY);
  } catch {
    return null;
  }
}

export async function writeSavedAddress(address: string | null): Promise<void> {
  if (!address) {
    await SecureStore.deleteItemAsync(SAVED_ADDRESS_KEY);
    return;
  }
  await SecureStore.setItemAsync(SAVED_ADDRESS_KEY, address);
  await addSavedAddress(address);
}

export async function readSavedAddresses(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(SAVED_ADDRESSES_KEY);
    if (!raw) {
      const legacy = await SecureStore.getItemAsync(SAVED_ADDRESS_KEY);
      return legacy ? [legacy] : [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export async function writeSavedAddresses(addresses: string[]): Promise<void> {
  const unique = Array.from(
    new Set(addresses.map((address) => address.trim()).filter(Boolean)),
  ).slice(0, 3);
  await SecureStore.setItemAsync(SAVED_ADDRESSES_KEY, JSON.stringify(unique));
  if (unique[0]) {
    await SecureStore.setItemAsync(SAVED_ADDRESS_KEY, unique[0]);
  }
}

export async function clearSavedAddresses(): Promise<void> {
  await SecureStore.deleteItemAsync(SAVED_ADDRESS_KEY);
  await SecureStore.deleteItemAsync(SAVED_ADDRESSES_KEY);
}

export async function addSavedAddress(address: string): Promise<string[]> {
  const normalized = address.trim();
  if (!normalized) {
    return readSavedAddresses();
  }
  const existing = await readSavedAddresses();
  const next = [normalized, ...existing.filter((item) => item !== normalized)].slice(0, 3);
  await writeSavedAddresses(next);
  return next;
}

export async function readFavoriteServiceIds(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(FAVORITE_SERVICES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function writeFavoriteServiceIds(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  await SecureStore.setItemAsync(FAVORITE_SERVICES_KEY, JSON.stringify(unique));
}

export async function clearFavoriteServiceIds(): Promise<void> {
  await SecureStore.deleteItemAsync(FAVORITE_SERVICES_KEY);
}

export async function readOnboardingCompleted(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_DONE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function writeOnboardingCompleted(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_DONE_KEY, 'true');
}

export async function readRatedOrderIds(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(RATED_ORDER_IDS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function addRatedOrderId(id: string): Promise<string[]> {
  const existing = await readRatedOrderIds();
  const next = Array.from(new Set([id, ...existing]));
  await SecureStore.setItemAsync(RATED_ORDER_IDS_KEY, JSON.stringify(next));
  return next;
}

export async function clearRatedOrderIds(): Promise<void> {
  await SecureStore.deleteItemAsync(RATED_ORDER_IDS_KEY);
}

export async function readCustomerAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function writeCustomerAccessToken(token: string | null): Promise<void> {
  if (!token) {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearCustomerSession(): Promise<void> {
  await writeCustomerAccessToken(null);
}
