import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CollarLayout from '@site/src/components/Collateral/CollarLayout';
import FeeBookPanel from '@site/src/components/Collateral/FeeBookPanel';
import FeeRevenuePanel from '@site/src/components/Collateral/FeeRevenuePanel';
import * as api from '@site/src/components/Collateral/api';
import {
  perBlock,
  sampledBuckets,
  totalOf,
  windowTotals,
} from '@site/src/components/Collateral/feeMarket';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

/**
 * Fee market — the priority bids on collateral, as a book.
 *
 * Both panels need the same two reads, and the settled mean the book's basis tile
 * shows is derived from the history the second panel plots. Fetching once here
 * keeps them consistent: two independent reads could disagree about the basis
 * across a refresh boundary.
 */
export default function CollateralFeesPage() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // The range must land on UTC day boundaries, and `until` is exclusive — so
    // this asks for the last WINDOW_DAYS complete days plus the one in progress.
    const until = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS;
    const from = until - WINDOW_DAYS * DAY_MS;

    const [statsResult, historyResult] = await Promise.allSettled([
      api.getCollateralStats(),
      api.getMiningBuckets({ from, until, interval: 'day' }),
    ]);

    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
      setStatsError(null);
    } else {
      setStats(null);
      setStatsError(statsResult.reason?.message ?? String(statsResult.reason));
    }

    if (historyResult.status === 'fulfilled') {
      setHistory(historyResult.value);
      setHistoryError(null);
    } else {
      setHistory(null);
      // A 503 here is the documented "history is loading or busy" answer, not a
      // broken client — say so rather than showing a bare request failure.
      const e = historyResult.reason;
      setHistoryError(
        e?.status === 503
          ? 'Statistics history is still loading or busy on the client. It appears here once collection catches up.'
          : (e?.message ?? String(e)),
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  /** Mean priority fee per Lithos block across the whole window — the settlement index. */
  const settled = useMemo(() => {
    const { sampled } = sampledBuckets(history);
    if (sampled.length === 0) return null;
    const { totals, blocks } = windowTotals(sampled);
    if (blocks === 0n) return null;
    return perBlock(totalOf(totals, 'lithos.priorityFeeNanoErg'), blocks);
  }, [history]);

  const spot = useMemo(
    () => (stats?.fees ? BigInt(stats.fees.bestNanoErg ?? '0') : null),
    [stats],
  );

  return (
    <CollarLayout
      title="Fee market"
      description="Priority bids on collateral, as a book: what miners are being offered now, what the queue will release, and what has actually settled."
    >
      <FeeBookPanel
        stats={stats}
        statsError={statsError}
        loading={loading}
        settled={settled}
      />
      <div style={{ marginTop: '1.25rem' }}>
        <FeeRevenuePanel
          history={history}
          error={historyError}
          loading={loading}
          spot={spot}
          days={WINDOW_DAYS}
        />
      </div>
    </CollarLayout>
  );
}
