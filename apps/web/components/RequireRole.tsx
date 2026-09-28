'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { AppHeader } from './AppHeader';
import { ErrorState } from './ErrorState';
import { Spinner } from './Spinner';

// The protected layout: logged out → /login, wrong role → your own area.
// This only decides what to draw; the API still checks the role on every call.
export function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { user, loading, error, retry } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || error) {
      return;
    }
    if (!user) {
      router.replace('/login');
    } else if (user.role !== role) {
      router.replace(homeFor(user.role));
    }
  }, [user, loading, error, role, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ErrorState message={error.message} onRetry={retry} />
      </main>
    );
  }
  if (user?.role !== role) {
    return <Spinner />;
  }
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </>
  );
}
