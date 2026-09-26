'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useQuery<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setError('');
      }
    });
    api<T>(path)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, error, loading, reload };
}
