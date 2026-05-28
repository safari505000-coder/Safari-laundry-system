import { apiJson } from './client';
import type {
  DriverDispatchSnapshot,
  DriverDispatchTask,
} from './dispatch-types';

export function pollDriverDispatches(
  token: string,
): Promise<DriverDispatchTask[]> {
  return apiJson<DriverDispatchSnapshot>('/driver/dispatch/mine/poll', {
    token,
  }).then((snapshot) => {
    const rows = Array.isArray(snapshot.rows) ? snapshot.rows : [];
    return rows.filter((row) => row.status === 'ASSIGNED' || row.status === 'IN_PROGRESS');
  });
}

export function acknowledgeDriverDispatch(
  token: string,
  dispatchId: string,
): Promise<DriverDispatchTask> {
  return apiJson<DriverDispatchTask>(
    `/driver/dispatch/${dispatchId}/acknowledge`,
    {
      method: 'POST',
      token,
    },
  );
}

export type {
  DriverDispatchSnapshot,
  DriverDispatchTask,
  DriverDispatchSeverity,
  DriverDispatchStatus,
} from './dispatch-types';
