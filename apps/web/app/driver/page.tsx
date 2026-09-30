'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { api, errorMessage } from '@/lib/api';
import { goOfflineBlocked } from '@/lib/driver-view';
import { formatTaka } from '@/lib/money';
import type { DriverStatus, Trip, WaitingRequest } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { zoneName } from '@/lib/zones';

// Jashim's dashboard: online toggle and the requests he can accept (PRD D1–D3).
export default function DriverDashboardPage() {
  const router = useRouter();
  const status = useApi<DriverStatus>('/driver/status');
  const requests = useApi<WaitingRequest[]>('/driver/requests', 5000);
  // His current trip, if any (404 = none). While there is one, he can't go offline.
  const trip = useApi<Trip>('/driver/pool', 5000);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function setOnline(online: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api<DriverStatus>('/driver/status', {
        method: 'PATCH',
        body: { online },
      });
    } catch (e) {
      // e.g. "You can't go offline during a trip"
      setMessage(errorMessage(e));
    }
    await Promise.all([status.reload(), requests.reload()]);
    setBusy(false);
  }

  async function accept(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api<Trip>(`/driver/requests/${id}/accept`, { method: 'POST' });
      router.push('/driver/trip');
      return;
    } catch (e) {
      // 409 POOL_FULL, REQUEST_UNAVAILABLE…: explain and show the fresh list.
      setMessage(errorMessage(e));
    }
    await requests.reload();
    setBusy(false);
  }

  if (status.loading) {
    return <Spinner />;
  }
  if (status.error || !status.data) {
    return (
      <ErrorState
        message={status.error?.message ?? 'Could not load your status'}
        onRetry={() => void status.reload()}
      />
    );
  }

  const online = status.data.online;
  const offlineBlocked = goOfflineBlocked(online, trip.data);
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">
            You are {online ? 'online' : 'offline'}
          </p>
          <p className="text-sm text-slate-500">
            {online
              ? 'Waiting requests you can accept appear below.'
              : 'Go online to see and accept requests.'}
          </p>
          {offlineBlocked && (
            <p className="text-sm text-amber-700">
              You can go offline after your{' '}
              <Link href="/driver/trip" className="underline">
                current trip
              </Link>{' '}
              is completed.
            </p>
          )}
        </div>
        <Button
          variant={online ? 'secondary' : 'primary'}
          disabled={busy || offlineBlocked}
          onClick={() => void setOnline(!online)}
        >
          {online ? 'Go offline' : 'Go online'}
        </Button>
      </Card>

      {message && (
        <p role="alert" className="text-sm text-rose-700">
          {message}
        </p>
      )}

      <h2 className="text-xl font-semibold">Waiting requests</h2>
      {!online && <EmptyState title="You're offline" />}
      {online && requests.loading && <Spinner />}
      {online && requests.error && (
        <ErrorState
          message={requests.error.message}
          onRetry={() => void requests.reload()}
        />
      )}
      {online && requests.data?.length === 0 && (
        <EmptyState title="No requests right now" />
      )}
      {online &&
        requests.data?.map((request) => (
          <Card key={request.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium">{request.passengerFirstName}</p>
              <p className="text-sm text-slate-500">
                {zoneName(request.pickupZone)} → {zoneName(request.dropoffZone)}{' '}
                · {request.seats} seat
                {request.seats > 1 ? 's' : ''} · {formatTaka(request.farePaisa)}
              </p>
            </div>
            <Button disabled={busy} onClick={() => void accept(request.id)}>
              Accept
            </Button>
          </Card>
        ))}
    </div>
  );
}
