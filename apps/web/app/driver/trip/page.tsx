'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { StatusBadge } from '@/components/StatusBadge';
import { api, errorMessage } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import type { RideStatus, Trip } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { zoneName } from '@/lib/zones';

// ONE next-step button, in order (PRD D4). Other steps are never shown, and the
// API would refuse them anyway (409 INVALID_TRANSITION).
const NEXT_STEP: Partial<
  Record<RideStatus, { action: string; label: string }>
> = {
  MATCHED: { action: 'arrive', label: 'Arrived' },
  DRIVER_ARRIVED: { action: 'start', label: 'Start trip' },
  STARTED: { action: 'complete', label: 'Complete trip' },
};

export default function DriverTripPage() {
  const router = useRouter();
  const {
    data: trip,
    error,
    loading,
    reload,
  } = useApi<Trip>('/driver/pool', 5000);
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  async function nextStep(current: Trip, action: string) {
    setBusy(true);
    setStepError(null);
    try {
      await api<Trip>(`/pools/${current.id}/${action}`, { method: 'POST' });
      if (action === 'complete') {
        router.push('/driver/history');
        return;
      }
      await reload();
    } catch (e) {
      setStepError(errorMessage(e));
      await reload();
    }
    setBusy(false);
  }

  if (loading) {
    return <Spinner />;
  }
  if (error?.code === 'NOT_FOUND') {
    return (
      <EmptyState title="No active trip">
        <Link href="/driver" className="text-emerald-700 underline">
          See waiting requests
        </Link>
      </EmptyState>
    );
  }
  if (error || !trip) {
    return (
      <ErrorState
        message={error?.message ?? 'Could not load your trip'}
        onRetry={() => void reload()}
      />
    );
  }

  const next = NEXT_STEP[trip.status];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Current trip</h1>
        <StatusBadge status={trip.status} />
      </div>
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <p className="text-slate-600">Pickup: {zoneName(trip.pickupZone)}</p>
          <p className="text-2xl font-semibold">
            {trip.seatsTaken} / {trip.capacity} seats
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1">Passenger</th>
              <th>Drop-off</th>
              <th>Seats</th>
              <th className="text-right">Fare (cash)</th>
            </tr>
          </thead>
          <tbody>
            {trip.passengers.map((p) => (
              <tr key={p.rideId} className="border-t border-slate-100">
                <td className="py-2 font-medium">{p.firstName}</td>
                <td>{zoneName(p.dropoffZone)}</td>
                <td>{p.seats}</td>
                <td className="text-right">{formatTaka(p.farePaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-right text-sm">
          Total: <strong>{formatTaka(trip.totalFarePaisa)}</strong>
        </p>
        {stepError && (
          <p role="alert" className="text-sm text-rose-700">
            {stepError}
          </p>
        )}
        {next && (
          <Button
            disabled={busy}
            onClick={() => void nextStep(trip, next.action)}
            className="w-full"
          >
            {busy ? 'Saving…' : next.label}
          </Button>
        )}
      </Card>
    </div>
  );
}
