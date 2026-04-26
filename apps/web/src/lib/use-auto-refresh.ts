'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoRefreshOptions {
  enabled: boolean;
  intervalMs: number;
  refresh: (signal: AbortSignal) => Promise<void>;
  pauseWhenHidden?: boolean;
}

interface UseAutoRefreshResult {
  isRefreshing: boolean;
  lastUpdatedAt: number | null;
  error: string | null;
  refreshNow: () => Promise<void>;
}

export function useAutoRefresh({
  enabled,
  intervalMs,
  refresh,
  pauseWhenHidden = true,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const refreshRef = useRef(refresh);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refreshNow = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    if (pauseWhenHidden && document.visibilityState !== 'visible') {
      return;
    }

    inFlightRef.current = true;
    setIsRefreshing(true);
    setError(null);
    const controller = new AbortController();
    activeControllerRef.current = controller;

    try {
      await refreshRef.current(controller.signal);

      if (!mountedRef.current) {
        return;
      }

      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      const message = err instanceof Error ? err.message : 'Refresh failed';
      setError(message);
    } finally {
      if (!mountedRef.current) {
        return;
      }
      inFlightRef.current = false;
      setIsRefreshing(false);
      activeControllerRef.current = null;
    }
  }, [pauseWhenHidden]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      activeControllerRef.current?.abort();
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();

    if (!enabled) {
      return;
    }

    const tick = async () => {
      if (!mountedRef.current) {
        return;
      }

      await refreshNow();

      if (!mountedRef.current) {
        return;
      }

      timerRef.current = setTimeout(tick, intervalMs);
    };

    timerRef.current = setTimeout(tick, intervalMs);

    const handleVisibilityChange = () => {
      if (!pauseWhenHidden || document.visibilityState === 'visible') {
        return;
      }
      activeControllerRef.current?.abort();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimer();
      activeControllerRef.current?.abort();
    };
  }, [clearTimer, enabled, intervalMs, pauseWhenHidden, refreshNow]);

  return { isRefreshing, lastUpdatedAt, error, refreshNow };
}
