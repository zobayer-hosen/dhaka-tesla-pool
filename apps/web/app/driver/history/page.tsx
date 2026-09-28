'use client';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { formatTaka } from '@/lib/money';
import type { Trip } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { formatDate, zoneName } from '@/lib/zones';

// Completed trips with passengers, total fare and completion time (PRD D5).
export default function DriverHistoryPage() {
  const { data, error, loading, reload } = useApi<Trip[]>('/driver/history');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Trip history</h1>
      {loading && <Spinner />}
      {error && (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      )}
      {data?.length === 0 && <EmptyState title="No trips yet" />}
      {data?.map((trip) => (
        <Card key={trip.id}>
          <div className="flex justify-between">
            <p className="font-medium">
              From {zoneName(trip.pickupZone)} · {trip.seatsTaken} /{' '}
              {trip.capacity} seats
            </p>
            <p className="font-semibold">{formatTaka(trip.totalFarePaisa)}</p>
          </div>
          <p className="text-sm text-slate-500">
            Completed {trip.completedAt ? formatDate(trip.completedAt) : ''}
          </p>
          <ul className="mt-2 text-sm">
            {trip.passengers.map((p) => (
              <li key={p.rideId}>
                {p.firstName} → {zoneName(p.dropoffZone)}, {p.seats} seat
                {p.seats > 1 ? 's' : ''}, {formatTaka(p.farePaisa)}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
