import React, { useCallback, useEffect, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import SwapPanel from './SwapPanel';
import LiquidityPanel from './LiquidityPanel';
import SwapAside from './SwapAside';
import FeeHistoryPanel from './FeeHistoryPanel';
import { PoolDepositCard, PoolRedeemCard, PoolSwapCard } from './PoolTrade';
import PoolOrdersCard from './PoolOrdersCard';
import { PoolInfoCard, VerifiedOnlyCard } from './PoolParts';
import { poolTrust } from './pools';

/**
 * This wallet's balance and a placement counter, for the order cards of a pool other than ERG:LIT. A placement
 * bumps the counter, which re-reads the balance and the pool's orders and provisions.
 */
function usePoolWallet() {
  const { tick } = useDex();
  const hasKey = api.hasApiKey();
  const [balance, setBalance] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!hasKey) {
      setBalance(null);
      return;
    }
    api.getWalletBalances().then(setBalance, () => setBalance(null));
  }, [tick, hasKey, version]);
  const placed = useCallback(() => setVersion((n) => n + 1), []);
  return { balance, version, placed };
}

/** ERG:LIT keeps its own page, with direct swaps; any other pool trades through orders. */
export function SwapPage() {
  const { isCanonical, selected, selectedVault } = useDex();
  const { balance, version, placed } = usePoolWallet();
  if (!selected) return null;
  if (isCanonical) return <SwapPanel />;
  return (
    <>
      <div className={s.swapLayout}>
        <div className={s.swapCol}>
          <PoolSwapCard pool={selected} balance={balance} unsafe={poolTrust(selected) === 'unsafe'} onPlaced={placed} />
          <PoolInfoCard pool={selected} vault={selectedVault} />
        </div>
        {selected.verified ? <SwapAside /> : <VerifiedOnlyCard title="Price charts and recent activity are kept for verified pools only" />}
      </div>
      <PoolOrdersCard pool={selected} version={version} />
    </>
  );
}

export function LiquidityPage() {
  const { isCanonical, selected } = useDex();
  const { balance, version, placed } = usePoolWallet();
  if (!selected) return null;
  if (isCanonical) return <LiquidityPanel />;
  return (
    <>
      <div className={s.cols}>
        <PoolDepositCard pool={selected} balance={balance} unsafe={poolTrust(selected) === 'unsafe'} onPlaced={placed} />
        <PoolRedeemCard pool={selected} version={version} onPlaced={placed} />
      </div>
      <PoolOrdersCard pool={selected} version={version} />
    </>
  );
}

/** Fee history is collected for verified pools only. */
export function HistoryPage() {
  const { selected } = useDex();
  if (!selected) return null;
  return selected.verified ? <FeeHistoryPanel /> : <VerifiedOnlyCard title="Fee history is kept for verified pools only" />;
}
