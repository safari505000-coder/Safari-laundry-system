type DriverAlertIndicatorProps = {
  /** True when there is at least one ASSIGNED dispatch in the driver queue. */
  showAlert: boolean;
};

export function DriverAlertIndicator({ showAlert }: DriverAlertIndicatorProps) {
  return (
    <>
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.25; transform: scale(1.12); }
          }
          .blink {
            animation: blink 1s infinite;
            color: red;
          }
          .pulse-alert {
            animation: blink 1s infinite;
          }
        `}
      </style>
      <div className="flex items-center gap-2">
        <span
          aria-label={showAlert ? 'تنبيه مهمة جديدة' : 'لا توجد مهام مسندة'}
          className={`text-3xl ${showAlert ? 'blink' : 'text-slate-400'}`}
          role="img"
        >
          🚨
        </span>
        {showAlert ? (
          <span className="pulse-alert rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
            🚨 مهمة جديدة
          </span>
        ) : null}
      </div>
    </>
  );
}
