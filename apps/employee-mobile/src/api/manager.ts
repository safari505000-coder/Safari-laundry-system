import { apiJson } from './client';
import { getApiBaseUrl } from './config';
import type {
  CashIntelDashboardResponse,
  DriverOversightCard,
  ManagerCashCustodyRow,
  ManagerCashStatusResponse,
} from './manager-types';

export async function uploadDepositSlipImage(
  token: string,
  imageUri: string,
): Promise<{ depositSlipUrl: string }> {
  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    name: 'deposit-slip.jpg',
    type: 'image/jpeg',
  } as any);

  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/manager-custody/upload-slip-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(raw || `Upload failed (${res.status})`);
  }
  return JSON.parse(raw);
}

export function attachDepositSlip(
  token: string,
  id: string,
  payload: { depositSlipUrl: string; declaredDepositTotal?: number; note?: string },
): Promise<ManagerCashCustodyRow> {
  return apiJson<ManagerCashCustodyRow>(`/manager-custody/${encodeURIComponent(id)}/upload-slip`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

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
