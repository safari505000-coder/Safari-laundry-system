import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PublicServiceItem } from '@/api/public';
import { readPersistedCart, writePersistedCart } from './cart-storage';
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
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void readPersistedCart().then((saved) => {
      if (cancelled) {
        return;
      }
      setLines(saved);
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const commitLines = useCallback((updater: (prev: CartLine[]) => CartLine[]) => {
    setLines((prev) => {
      const next = updater(prev);
      if (hydratedRef.current) {
        void writePersistedCart(next);
      }
      return next;
    });
  }, []);

  const addService = useCallback((item: PublicServiceItem, quantity = 1) => {
    const qty = Math.max(1, Math.min(99, quantity));
    commitLines((prev) => {
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
  }, [commitLines]);

  const setQuantity = useCallback((serviceId: string, quantity: number) => {
    if (quantity <= 0) {
      commitLines((prev) => prev.filter((l) => l.serviceId !== serviceId));
      return;
    }
    commitLines((prev) =>
      prev.map((l) =>
        l.serviceId === serviceId
          ? { ...l, quantity: Math.min(99, quantity) }
          : l,
      ),
    );
  }, [commitLines]);

  const removeLine = useCallback((serviceId: string) => {
    commitLines((prev) => prev.filter((l) => l.serviceId !== serviceId));
  }, [commitLines]);

  const clearCart = useCallback(() => {
    commitLines(() => []);
  }, [commitLines]);

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
