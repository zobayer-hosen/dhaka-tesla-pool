'use client';

import { Card } from '@/components/Card';
import { useAuth } from '@/lib/auth';

// Placeholder landing page for drivers; the driver screens come in Step 9.
export default function DriverPage() {
  const { user } = useAuth();
  return (
    <Card>
      <h1 className="text-xl font-semibold">Hi {user?.name}</h1>
      <p className="mt-2 text-sm text-slate-600">You are in the driver area.</p>
    </Card>
  );
}
