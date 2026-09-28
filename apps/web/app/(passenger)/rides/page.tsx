'use client';

import Link from 'next/link';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import { formatTaka } from '@/lib/money';
import type { RideSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { formatDate, zoneName } from '@/lib/zones';

// My completed and cancelled rides, newest first (PRD P6).
export default function RideHistoryPage() {
  const { data, error, loading, reload } = useApi<RideSummary[]>('/rides');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My rides</h1>
      {loading && <Spinner />}
      {error && (
        <ErrorState message={error.message} onRetry={() => void reload()} />
      )}
      {data?.length === 0 && (
        <EmptyState title="No rides yet — book your first one">
          <Link href="/ride/new" className="text-emerald-700 underline">
            Book a ride
          </Link>
        </EmptyState>
      )}
      {data?.map((ride) => (
        <Card key={ride.id} className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {zoneName(ride.pickupZone)} → {zoneName(ride.dropoffZone)}
            </p>
            <p className="text-sm text-slate-500">
              {formatDate(ride.createdAt)} · {ride.seats} seat
              {ride.seats > 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{formatTaka(ride.farePaisa)}</p>
            <StatusBadge status={ride.status} />
          </div>
        </Card>
      ))}
    </div>
  );
}
