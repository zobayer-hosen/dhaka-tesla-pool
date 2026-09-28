'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, errorMessage } from './api';

// Loads one GET endpoint and tracks loading / error. With pollMs it refreshes
// on a timer: pages poll every 5 s instead of using WebSockets (PRD A9).
export function useApi<T>(path: string, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setData(null);
      setError(
        e instanceof ApiError ? e : new ApiError(0, 'ERROR', errorMessage(e)),
      );
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
    if (!pollMs) {
      return;
    }
    const timer = setInterval(() => void reload(), pollMs);
    return () => clearInterval(timer);
  }, [reload, pollMs]);

  return { data, error, loading, reload };
}
