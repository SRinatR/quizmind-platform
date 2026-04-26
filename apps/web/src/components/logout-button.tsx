'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { usePreferences } from '../lib/preferences';

export function LogoutButton() {
  const router = useRouter();
  const { t } = usePreferences();
  const [isPending, setIsPending] = useState(false);
  const [, startNavigation] = useTransition();

  async function handleLogout() {
    setIsPending(true);
    await fetch('/bff/auth/logout', { method: 'POST' }).catch(() => null);
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
      {isPending ? t.shell.signingOut : t.shell.signOut}
    </button>
  );
}
