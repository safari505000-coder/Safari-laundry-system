import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PublicServiceItem } from '@/api/public';
import { estimateCartTotalKd } from './cart-totals';

export type CartLine = {
  serviceId: string;
  label: string;
  quantity: number;
  priceNormalKd: string;
  priceExpressKd: string;
};

type OrderCartContextValue = {
  lines: CartLine[];
  totalItems: number;
  estimateTotalKd: (serviceType?: 'NORMAL' | 'EXPRESS') => string;
  addService: (item: PublicServiceItem, quantity?: number) => void;
  setQuantity: (serviceId: string, quantity: number) => void;
  removeLine: (serviceId: string) => void;
  clearCart: () => void;
};

const OrderCartContext = createContext<OrderCartContextValue | null>(null);

export function OrderCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const addService = useCallback((item: PublicServiceItem, quantity = 1) => {
    const qty = Math.max(1, Math.min(99, quantity));
    setLines((prev) => {
      const existing = prev.find((l) => l.serviceId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.serviceId === item.id
            ? { ...l, quantity: Math.min(99, l.quantity + qty) }
            : l,
        );
      }
      return [
        ...prev,
        {
          serviceId: item.id,
          label: item.nameAr,
          quantity: qty,
          priceNormalKd: item.priceNormalKd,
          priceExpressKd: item.priceExpressKd,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((serviceId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((prev) => prev.filter((l) => l.serviceId !== serviceId));
      return;
    }
    setLines((prev) =>
      prev.map((l) =>
        l.serviceId === serviceId
          ? { ...l, quantity: Math.min(99, quantity) }
          : l,
      ),
    );
  }, []);

  const removeLine = useCallback((serviceId: string) => {
    setLines((prev) => prev.filter((l) => l.serviceId !== serviceId));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const totalItems = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity, 0),
    [lines],
  );

  const estimateTotalKd = useCallback(
    (serviceType: 'NORMAL' | 'EXPRESS' = 'NORMAL') =>
      estimateCartTotalKd(lines, serviceType),
    [lines],
  );

  const value = useMemo(
    () => ({
      lines,
      totalItems,
      estimateTotalKd,
      addService,
      setQuantity,
      removeLine,
      clearCart,
    }),
    [lines, totalItems, estimateTotalKd, addService, setQuantity, removeLine, clearCart],
  );

  return (
    <OrderCartContext.Provider value={value}>{children}</OrderCartContext.Provider>
  );
}

export function useOrderCart() {
  const ctx = useContext(OrderCartContext);
  if (!ctx) {
    throw new Error('useOrderCart must be used within OrderCartProvider');
  }
  return ctx;
}
