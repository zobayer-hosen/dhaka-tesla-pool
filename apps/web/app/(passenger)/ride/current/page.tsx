'use client';

import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';

// Placeholder landing page for passengers; the ride screens come next (Step 8).
export default function CurrentRidePage() {
  const { user } = useAuth();
  return (
    <Card>
      <h1 className="text-xl font-semibold">Hi {user?.name}</h1>
      <p className="mt-2 text-sm text-slate-600">
        You are in the passenger area.
      </p>
    </Card>
  );
}
