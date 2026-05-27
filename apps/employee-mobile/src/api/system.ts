import { apiJson } from './client';

export type OperatingStatusPayload = {
  isOpen: boolean;
  lockEnabled?: boolean;
  kuwaitTimeLabel: string;
  financialDateIso: string;
  financialDateLabel: string;
  reportingDayStartHour: number;
  fullScreenClosedRoles: readonly string[];
};

export function fetchOperatingStatus(): Promise<OperatingStatusPayload> {
  return apiJson<OperatingStatusPayload>('/system/operating-status');
}
