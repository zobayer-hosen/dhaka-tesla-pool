import type { RideStatus } from '@/lib/types';

// What each status is called on screen (PRD P4).
export const STATUS_LABELS: Record<RideStatus, string> = {
  REQUESTED: 'Waiting',
  MATCHED: 'Matched',
  DRIVER_ARRIVED: 'Driver arrived',
  STARTED: 'On the way',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const COLORS: Record<RideStatus, string> = {
  REQUESTED: 'bg-amber-100 text-amber-800',
  MATCHED: 'bg-sky-100 text-sky-800',
  DRIVER_ARRIVED: 'bg-indigo-100 text-indigo-800',
  STARTED: 'bg-violet-100 text-violet-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ status }: { status: RideStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
