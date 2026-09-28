import { formatTaka } from '@/lib/money';
import type { Fare } from '@/lib/types';

// Shows the fare exactly as the API calculated it (per seat, then the total).
// Only the passenger's own fare is ever passed in (PRD §9).
export function FareBreakdown({ fare, seats }: { fare: Fare; seats: number }) {
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Base fare" value={formatTaka(fare.baseFarePaisa)} />
      <Row label="Distance" value={formatTaka(fare.distanceChargePaisa)} />
      {fare.poolDiscountPaisa > 0 && (
        <Row
          label="Pool discount"
          value={`−${formatTaka(fare.poolDiscountPaisa)}`}
          className="text-emerald-700"
        />
      )}
      {seats > 1 && <Row label="Seats" value={`× ${seats}`} />}
      <Row
        label="Your fare"
        value={formatTaka(fare.farePaisa)}
        className="border-t border-slate-200 pt-1 text-base font-semibold"
      />
    </dl>
  );
}

function Row({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`flex justify-between ${className}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
