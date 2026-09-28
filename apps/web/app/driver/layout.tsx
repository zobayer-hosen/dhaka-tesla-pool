'use client';

import { RequireRole } from '@/components/RequireRole';

// Every driver page: /driver, /driver/trip, /driver/history.
export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireRole role="DRIVER">{children}</RequireRole>;
}
