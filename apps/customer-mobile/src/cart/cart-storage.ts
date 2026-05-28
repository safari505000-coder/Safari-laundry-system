import * as SecureStore from 'expo-secure-store';
import type { CartLine } from './order-cart';
import { parsePersistedCartLines, serializeCartLines } from './cart-persisted-lines';

const CART_KEY = 'safari_customer_cart_v1';

export { parsePersistedCartLines } from './cart-persisted-lines';

export async function readPersistedCart(): Promise<CartLine[]> {
  try {
    const raw = await SecureStore.getItemAsync(CART_KEY);
    return parsePersistedCartLines(raw);
  } catch {
    return [];
  }
}

export async function writePersistedCart(lines: CartLine[]): Promise<void> {
  try {
    if (lines.length === 0) {
      await SecureStore.deleteItemAsync(CART_KEY);
      return;
    }
    await SecureStore.setItemAsync(CART_KEY, serializeCartLines(lines));
  } catch {
    // Non-blocking — cart still works in memory for this session.
  }
}
