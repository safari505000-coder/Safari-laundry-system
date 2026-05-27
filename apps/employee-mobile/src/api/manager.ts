import { apiJson } from './client';
import type {
  CashIntelDashboardResponse,
  DriverOversightCard,
  ManagerCashCustodyRow,
  ManagerCashStatusResponse,
} from './manager-types';

export function fetchDriverOversight(
  token: string,
): Promise<DriverOversightCard[]> {
  return apiJson<DriverOversightCard[]>('/manager/driver-oversight', {
    token,
  }).then((rows) => (Array.isArray(rows) ? rows : []));
}

export function fetchCashIntelligenceDashboard(
  token: string,
): Promise<CashIntelDashboardResponse> {
  return apiJson<CashIntelDashboardResponse>(
    '/cash-intelligence/dashboard',
    { token },
  );
}

export function fetchManagerCashStatus(
  token: string,
): Promise<ManagerCashStatusResponse> {
  return apiJson<ManagerCashStatusResponse>('/manager/cash-status', { token });
}

export function listMyManagerCustody(
  token: string,
): Promise<ManagerCashCustodyRow[]> {
  return apiJson<ManagerCashCustodyRow[]>('/manager-custody/mine', { token }).then(
    (rows) => (Array.isArray(rows) ? rows : []),
  );
}

export function approveReceiptFromDriver(
  token: string,
  body: { driverId: string; note?: string },
): Promise<ManagerCashCustodyRow> {
  return apiJson<ManagerCashCustodyRow>('/manager-custody/approve-receipt', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export type {
  CashIntelDashboardResponse,
  DriverOversightCard,
  ManagerCashCustodyRow,
  ManagerCashStatusDriverRow,
  ManagerCashStatusResponse,
} from './manager-types';
