'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FareBreakdown } from '@/components/FareBreakdown';
import { Spinner } from '@/components/Spinner';
import { StatusProgress } from '@/components/StatusProgress';
import { api, errorMessage } from '@/lib/api';
import type { Ride } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { zoneName } from '@/lib/zones';

// Cancel only before the driver arrives (PRD A7). The API checks it too.
const CANCELLABLE = ['REQUESTED', 'MATCHED'];

// My active ride, refreshed every 5 s so fare and status changes show up.
export default function CurrentRidePage() {
  const {
    data: ride,
    error,
    loading,
    reload,
  } = useApi<Ride>('/rides/current', 5000);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function cancel(id: string) {
    setCancelling(true);
    setCancelError(null);
    try {
      await api<Ride>(`/rides/${id}/cancel`, { method: 'POST' });
    } catch (e) {
      setCancelError(errorMessage(e));
    }
    await reload();
    setCancelling(false);
  }

  if (loading) {
    return <Spinner />;
  }
  // No active ride is a normal answer (DECISIONS #23), not an error.
  if (error?.code === 'NOT_FOUND') {
    return (
      <EmptyState title="No active ride — book one">
        <Link href="/ride/new" className="text-emerald-700 underline">
          Book a ride
        </Link>
        <span className="mx-2 text-slate-400">·</span>
        {/* A completed ride isn't active any more: it is in the history. */}
        <Link href="/rides" className="text-emerald-700 underline">
          See past rides
        </Link>
      </EmptyState>
    );
  }
  if (error || !ride) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your ride'}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My ride</h1>
      <Card className="space-y-5">
        <StatusProgress status={ride.status} />
        <p className="text-lg font-medium">
          {zoneName(ride.pickupZone)} → {zoneName(ride.dropoffZone)} ·{' '}
          {ride.seats} seat{ride.seats > 1 ? 's' : ''}
        </p>

        {ride.driver ? (
          <p className="text-sm">
            Driver <strong>{ride.driver.name}</strong> in{' '}
            <strong>{ride.driver.vehicle}</strong> ({ride.driver.plateNumber})
          </p>
        ) : (
          <p className="text-sm text-amber-700">
            We&apos;re still looking for you. A driver will pick you up soon.
          </p>
        )}

        {ride.coRiderCount > 0 && (
          <p className="text-sm text-emerald-700">
            Shared with {ride.coRiderCount} other passenger
            {ride.coRiderCount > 1 ? 's' : ''}
          </p>
        )}

        <FareBreakdown fare={ride.fare} seats={ride.seats} />

        {cancelError && (
          <p role="alert" className="text-sm text-rose-700">
            {cancelError}
          </p>
        )}
        {CANCELLABLE.includes(ride.status) && (
          <Button
            variant="danger"
            disabled={cancelling}
            onClick={() => void cancel(ride.id)}
          >
            {cancelling ? 'Cancelling…' : 'Cancel ride'}
          </Button>
        )}
      </Card>
    </div>
  );
}
