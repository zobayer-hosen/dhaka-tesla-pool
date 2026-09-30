'use client';

import Link from 'next/link';
import { formatTaka } from '@/lib/money';
import { recentCompletedRide } from '@/lib/ride-view';
import type { Ride, RideSummary } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { zoneName } from '@/lib/zones';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';

// "My ride" when GET /rides/current says there is no active ride. A completed
// ride isn't active, so this shows the trip Nusrat just finished (last 30 min),
// taken from her history, or else the usual "book one" empty state.
export function NoActiveRide() {
  const history = useApi<RideSummary[]>('/rides');

  if (history.loading) {
    return <Spinner />;
  }
  // If the history can't be loaded, "no active ride" is still the right answer.
  const recent = history.data
    ? recentCompletedRide(history.data, new Date())
    : null;
  return recent ? <CompletedRide ride={recent} /> : <NothingActive />;
}

function CompletedRide({ ride }: { ride: RideSummary }) {
  // The history row has no driver; the ride's own detail (GET /rides/:id) does.
  const detail = useApi<Ride>(`/rides/${ride.id}`);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My ride</h1>
      <Card className="space-y-4">
        <p className="text-lg font-semibold text-emerald-700">Completed ✅</p>
        <p className="text-lg font-medium">
          {zoneName(ride.pickupZone)} → {zoneName(ride.dropoffZone)} ·{' '}
          {ride.seats} seat{ride.seats > 1 ? 's' : ''}
        </p>
        {detail.data?.driver && (
          <p className="text-sm">
            Driver <strong>{detail.data.driver.name}</strong> in{' '}
            <strong>{detail.data.driver.vehicle}</strong>
          </p>
        )}
        <p className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
          <span>Your fare</span>
          <span>{formatTaka(ride.farePaisa)}</span>
        </p>
        <Link
          href="/ride/new"
          className="block rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-700"
        >
          Book a new ride
        </Link>
        <Link href="/rides" className="block text-center text-sm underline">
          See past rides
        </Link>
      </Card>
    </div>
  );
}

function NothingActive() {
  return (
    <EmptyState title="No active ride — book one">
      <Link href="/ride/new" className="text-emerald-700 underline">
        Book a ride
      </Link>
      <span className="mx-2 text-slate-400">·</span>
      <Link href="/rides" className="text-emerald-700 underline">
        See past rides
      </Link>
    </EmptyState>
  );
}
