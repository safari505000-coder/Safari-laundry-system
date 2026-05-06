import {
  subscribeDriverTasksPoll,
  useDriverTasks,
  type DriverTask,
  type DriverTaskSeverity,
  type DriverTaskStatus,
} from '../../tasks/hooks/use-driver-tasks';

export type DriverDispatchSeverity = DriverTaskSeverity;
export type DriverDispatchStatus = DriverTaskStatus;
export type DriverDispatch = DriverTask;

export { subscribeDriverTasksPoll };

export type UseDriverDispatchesResult = {
  dispatches: DriverTask[];
  hasNew: boolean;
  loading: boolean;
  error: string | null;
  markAsSeen: (dispatchId?: string) => void;
  acknowledgeDispatch: (dispatchId: string) => Promise<void>;
  acknowledgingId: string | null;
};

export function useDriverDispatches(): UseDriverDispatchesResult {
  const r = useDriverTasks();
  return {
    dispatches: r.tasks,
    hasNew: r.hasAssignedAlert,
    loading: r.loading,
    error: r.error,
    markAsSeen: r.markSeen,
    acknowledgeDispatch: r.acknowledgeDispatch,
    acknowledgingId: r.acknowledgingId,
  };
}
