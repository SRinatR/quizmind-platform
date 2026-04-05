'use client';

import { createContext, useContext } from 'react';

interface ShellProfileValue {
  /** Call after a successful profile save to update the sidebar dock immediately. */
  updateShellProfile: (displayName: string | null | undefined, avatarUrl: string | null | undefined) => void;
}

export const ShellProfileContext = createContext<ShellProfileValue>({
  updateShellProfile: () => undefined,
});

export function useShellProfile(): ShellProfileValue {
  return useContext(ShellProfileContext);
}
