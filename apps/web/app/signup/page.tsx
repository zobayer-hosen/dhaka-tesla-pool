'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const INPUT = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

// Passengers only: drivers are seeded (PRD A3).
export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignup() {
    setSubmitting(true);
    setError(null);
    try {
      await signup(name, email, password);
      router.replace('/ride/new');
    } catch (e) {
      // The API's validation or EMAIL_TAKEN message.
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">
        Create a passenger account
      </h1>
      <Card>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSignup();
          }}
        >
          <label className="block text-sm">
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="block text-sm">
            Password (at least 8 characters)
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="text-emerald-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
