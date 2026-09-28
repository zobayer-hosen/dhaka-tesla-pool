'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatTaka } from '@/lib/money';
import type { FareEstimate, Ride, Zone } from '@/lib/types';
import { useApi } from '@/lib/use-api';

const SELECT =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2';

export default function NewRidePage() {
  const router = useRouter();
  const zones = useApi<Zone[]>('/zones');
  const [pickup, setPickup] = useState('BANANI');
  const [dropoff, setDropoff] = useState('MOHAKHALI');
  const [seats, setSeats] = useState(1);
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [bookError, setBookError] = useState<ApiError | null>(null);
  const [booking, setBooking] = useState(false);
  const sameZone = pickup === dropoff;

  // Ask the API for the fare whenever the trip changes. The browser never
  // calculates a fare itself: the API's number is the one that gets charged.
  useEffect(() => {
    if (sameZone) {
      return;
    }
    let stale = false;
    api<FareEstimate>('/rides/estimate', {
      method: 'POST',
      body: { pickupZone: pickup, dropoffZone: dropoff, seats },
    })
      .then((result) => {
        if (!stale) {
          setEstimate(result);
          setEstimateError(null);
        }
      })
      .catch((e: unknown) => {
        if (!stale) {
          setEstimate(null);
          setEstimateError(errorMessage(e));
        }
      });
    // A newer choice was made before this answer came back: ignore it.
    return () => {
      stale = true;
    };
  }, [pickup, dropoff, seats, sameZone]);

  async function book() {
    setBooking(true);
    setBookError(null);
    try {
      await api<Ride>('/rides', {
        method: 'POST',
        body: { pickupZone: pickup, dropoffZone: dropoff, seats },
      });
      router.push('/ride/current');
    } catch (e) {
      setBookError(
        e instanceof ApiError ? e : new ApiError(0, 'ERROR', errorMessage(e)),
      );
      setBooking(false);
    }
  }

  if (zones.loading) {
    return <Spinner />;
  }
  if (zones.error || !zones.data) {
    return (
      <ErrorState
        message={zones.error?.message ?? 'Could not load zones'}
        onRetry={() => void zones.reload()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Book a ride</h1>
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm">
            Pickup
            <select
              className={SELECT}
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            >
              {zones.data.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Drop-off
            <select
              className={SELECT}
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
            >
              {zones.data.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Seats
            <select
              className={SELECT}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg bg-slate-50 p-4 text-sm">
          {sameZone && (
            <p className="text-rose-700">Pickup and drop-off must differ.</p>
          )}
          {!sameZone && estimateError && (
            <p className="text-rose-700">{estimateError}</p>
          )}
          {!sameZone && !estimateError && !estimate && <p>Estimating…</p>}
          {!sameZone && !estimateError && estimate && (
            <div className="space-y-1">
              <p>
                Solo fare:{' '}
                <strong>{formatTaka(estimate.solo.farePaisa)}</strong>
              </p>
              {estimate.pooled ? (
                <p className="text-emerald-700">
                  If you join the open pool:{' '}
                  <strong>{formatTaka(estimate.pooled.farePaisa)}</strong>
                </p>
              ) : (
                <p className="text-slate-500">
                  No shared ride to join yet: you may get the pool discount if
                  someone joins you.
                </p>
              )}
            </div>
          )}
        </div>

        {bookError && (
          <p role="alert" className="text-sm text-rose-700">
            {bookError.message}
            {bookError.code === 'ACTIVE_RIDE_EXISTS' && (
              <>
                {' '}
                <Link href="/ride/current" className="underline">
                  See my ride
                </Link>
              </>
            )}
          </p>
        )}

        <Button
          disabled={sameZone || booking}
          onClick={() => void book()}
          className="w-full"
        >
          {booking ? 'Booking…' : 'Confirm ride'}
        </Button>
      </Card>
    </div>
  );
}
