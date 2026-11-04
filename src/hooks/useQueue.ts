import { useState, useEffect } from 'react';
import { Report } from '../types';
import { queueEngine } from '../services/uploadQueue';

export function useQueue() {
  const [reports, setReports] = useState<Report[]>(queueEngine.getQueue());

  useEffect(() => {
    queueEngine.initialize();
    const unsubscribe = queueEngine.subscribe((updatedReports) => {
      setReports(updatedReports);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const pendingCount = reports.filter(r => r.status === 'queued').length;
  const inFlightCount = reports.filter(r => r.status === 'processing').length;
  const deliveredCount = reports.filter(r => r.status === 'delivered').length;
  const failedCount = reports.filter(r => r.status === 'failed').length;

  return {
    reports,
    pendingCount,
    inFlightCount,
    deliveredCount,
    failedCount,
    retryReport: (id: string) => queueEngine.retryReport(id),
    deleteReport: (id: string) => queueEngine.deleteReport(id),
    resetAll: () => queueEngine.resetAll(),
    enqueue: (report: Report) => queueEngine.enqueue(report)
  };
}
