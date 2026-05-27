import { useCallback, useEffect, useState } from 'react';
import {
  fetchLaundryCategories,
  fetchLaundryPriceList,
  type LaundryCategoryRow,
  type LaundryPriceListItemRow,
} from '@/api/pos';
import { useAuth } from '@/auth/auth-context';
import { rowShowsInLiveCatalog } from '@/lib/pos-pricing';

export function usePosPriceList() {
  const { getValidAccessToken } = useAuth();
  const [items, setItems] = useState<LaundryPriceListItemRow[]>([]);
  const [categories, setCategories] = useState<LaundryCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const [priceRows, categoryRows] = await Promise.all([
        fetchLaundryPriceList(token),
        fetchLaundryCategories(token),
      ]);
      setItems(priceRows.filter(rowShowsInLiveCatalog));
      setCategories(categoryRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تحميل الأسعار');
    } finally {
      setLoading(false);
    }
  }, [getValidAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, categories, loading, error, reload: load };
}
