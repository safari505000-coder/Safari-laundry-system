import { apiJson } from './client';
import type {
  CustomerDirectoryRow,
  CustomerSearchHit,
} from './call-center-types';

export function searchCustomers(
  token: string,
  query: string,
): Promise<CustomerSearchHit[]> {
  return apiJson<CustomerDirectoryRow[]>(
    `/customers?q=${encodeURIComponent(query)}`,
    { token },
  ).then((rows) =>
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row?.customer?.id)
      .slice(0, 25)
      .map((row) => ({
        id: row.customer.id,
        displayName: row.customer.displayName ?? row.customer.phone,
        phone: row.customer.phone,
        phone2: row.customer.phone2 ?? null,
        totalDebtKd: row.debt?.totalDebt ?? '0.0000',
      })),
  );
}

export type { CustomerSearchHit } from './call-center-types';
