import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import {
  useDriverGps,
  type DriverGpsState,
} from '@/device/use-driver-gps';

const DriverGpsContext = createContext<DriverGpsState | null>(null);

export function DriverGpsProvider({ children }: { children: ReactNode }) {
  const value = useDriverGps();
  return (
    <DriverGpsContext.Provider value={value}>
      {children}
    </DriverGpsContext.Provider>
  );
}

export function useDriverGpsContext(): DriverGpsState {
  const ctx = useContext(DriverGpsContext);
  if (!ctx) {
    throw new Error('useDriverGpsContext must be used within DriverGpsProvider');
  }
  return ctx;
}
