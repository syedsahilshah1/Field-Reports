import { useState, useEffect, useCallback } from 'react';
import { ServerReport } from '../types';
import { apiFetchServerReports } from '../services/apiClient';

export function useServerReports() {
  const [reports, setReports] = useState<ServerReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchServerReports();
      setReports(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch server reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return {
    reports,
    loading,
    error,
    refresh: fetchReports
  };
}
