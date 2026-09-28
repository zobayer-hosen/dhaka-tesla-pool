import type { RideStatus } from '@/lib/types';
import { STATUS_LABELS, StatusBadge } from './StatusBadge';

const STEPS: RideStatus[] = [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
];

// Waiting → Matched → Driver arrived → On the way → Completed (PRD P4).
export function StatusProgress({ status }: { status: RideStatus }) {
  if (status === 'CANCELLED') {
    return <StatusBadge status={status} />;
  }
  const current = STEPS.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1 text-center text-xs">
      {STEPS.map((step, index) => (
        <li key={step}>
          <div
            className={`mb-1 h-2 rounded-full ${
              index <= current ? 'bg-emerald-500' : 'bg-slate-200'
            }`}
          />
          <span
            className={
              index === current
                ? 'font-semibold text-slate-900'
                : 'text-slate-500'
            }
          >
            {STATUS_LABELS[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}
