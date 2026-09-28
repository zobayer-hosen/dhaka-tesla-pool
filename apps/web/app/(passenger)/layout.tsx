'use client';

import { RequireRole } from '@/components/RequireRole';

// Every passenger page: /ride/new, /ride/current, /rides.
export default function PassengerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole role="PASSENGER">{children}</RequireRole>;
}
