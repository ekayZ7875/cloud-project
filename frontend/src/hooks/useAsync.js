import { useState, useCallback, useRef, useEffect } from 'react';
import { getProcessingStatus } from '../services/file.service';

export function useAsync(asyncFn) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await asyncFn(...args);
        setData(result);
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn]
  );

  return { data, error, loading, execute, setData };
}

export function useProcessingPoller(jobId, onComplete) {
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef(null);

  const startPolling = useCallback(() => {
    if (!jobId) return;
    setPolling(true);

    const poll = async () => {
      try {
        const result = await getProcessingStatus(jobId);
        setStatus(result);
        const currentStatus = result?.job?.status || result?.status;
        if (
          currentStatus === 'COMPLETED' ||
          currentStatus === 'FAILED' ||
          currentStatus === 'completed' ||
          currentStatus === 'failed'
        ) {
          clearInterval(intervalRef.current);
          setPolling(false);
          onComplete?.(result);
        }
      } catch {
        clearInterval(intervalRef.current);
        setPolling(false);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 15000);
  }, [jobId, onComplete]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { status, polling, startPolling };
}
