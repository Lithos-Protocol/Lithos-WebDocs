import { useEffect, useRef } from 'react';

/**
 * Call `onTick` every `seconds` seconds, or not at all when `seconds` is 0.
 *
 * The callback is held in a ref so a caller can pass an inline closure without
 * tearing down and rebuilding the interval on every render — the interval is
 * rebuilt only when the period itself changes.
 *
 * Shared by the Dex and Collateral layouts; each reads its own stored period.
 */
export default function useAutoRefresh(seconds, onTick) {
  const cb = useRef(onTick);
  cb.current = onTick;

  useEffect(() => {
    if (!seconds) return undefined;
    const id = setInterval(() => cb.current?.(), seconds * 1000);
    return () => clearInterval(id);
  }, [seconds]);
}
