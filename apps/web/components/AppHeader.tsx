'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS = {
  PASSENGER: [
    { href: '/ride/current', label: 'My ride' },
    { href: '/ride/new', label: 'Book a ride' },
    { href: '/rides', label: 'History' },
  ],
  DRIVER: [
    { href: '/driver', label: 'Requests' },
    { href: '/driver/trip', label: 'Current trip' },
    { href: '/driver/history', label: 'History' },
  ],
};

export function AppHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) {
    return null;
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="font-semibold text-emerald-700">Dhaka Tesla Pool</span>
        <nav className="flex gap-4 text-sm">
          {LINKS[user.role].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? 'font-semibold text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-slate-600">{user.name}</span>
          <button
            className="text-slate-500 underline hover:text-slate-900"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
