'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in: straight to your own area.
  useEffect(() => {
    if (!loading && user) {
      router.replace(homeFor(user.role));
    }
  }, [user, loading, router]);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    try {
      const me = await login(email, password);
      router.replace(homeFor(me.role));
    } catch (e) {
      // The API's own message, e.g. "Invalid email or password".
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-1 text-2xl font-semibold">Dhaka Tesla Pool</h1>
      <p className="mb-6 text-sm text-slate-500">
        Share a seat. Split the fare. Survive Dhaka traffic.
      </p>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin();
          }}
        >
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-xs text-slate-500">
        Demo accounts (password <code>password123</code>): jashim, nusrat, rafiq
        or shirin @teslapool.dev
      </p>
    </main>
  );
}
