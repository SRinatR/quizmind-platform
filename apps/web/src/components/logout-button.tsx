'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [, startNavigation] = useTransition();

  async function handleLogout() {
    setIsPending(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    startNavigation(() => {
      router.push('/auth/login');
      router.refresh();
    });
  }

  return (
    <button
      className="app-sidebar__logout-btn"
      disabled={isPending}
      onClick={() => void handleLogout()}
      type="button"
    >
      {isPending ? 'Signing out\u2026' : 'Sign out'}
    </button>
  );
}
