'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import { homeFor, useAuth } from '@/lib/auth';

// "/" only sends you on: to your own area if logged in, else to /login.
export default function HomePage() {
  const { user, loading, error, retry } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !error) {
      router.replace(user ? homeFor(user.role) : '/login');
    }
  }, [user, loading, error, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <ErrorState message={error.message} onRetry={retry} />
      </main>
    );
  }
  return <Spinner />;
}
