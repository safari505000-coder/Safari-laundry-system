type TaskAlertProps = {
  showAlert: boolean;
};

export function TaskAlert({ showAlert }: TaskAlertProps) {
  return (
    <>
      <style>
        {`
          @keyframes blink {
            0%, 100% { opacity: 1; transform: scale(1.14); }
            50% { opacity: 0.25; transform: scale(1); }
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
          role="img"
          aria-label={showAlert ? 'مهمة مسندة' : 'لا توجد مهام مسندة'}
          className={`text-3xl ${showAlert ? 'blink' : 'text-slate-400'}`}
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
