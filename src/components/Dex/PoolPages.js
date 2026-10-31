import React, { useCallback, useEffect, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import SwapPanel from './SwapPanel';
import LiquidityPanel, { LiquidityModeBar } from './LiquidityPanel';
import SwapAside from './SwapAside';
import FeeHistoryPanel from './FeeHistoryPanel';
import { PoolDepositCard, PoolRedeemCard, PoolSwapCard } from './PoolTrade';
import PoolOrdersCard from './PoolOrdersCard';
import { PoolInfoCard, VerifiedOnlyCard } from './PoolParts';
import { poolTrust } from './pools';
import NftLookupCard from './NftLookupCard';

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

/**
 * ERG:LIT keeps its own page. A verified pool shows its chart and activity beside the swap; an unverified one has
 * none, so the pool's details take that column instead.
 */
export function SwapPage() {
  const { isCanonical, selected, selectedVault } = useDex();
  const { balance, version, placed } = usePoolWallet();
  if (!selected) return null;
  if (isCanonical) return <SwapPanel />;
  const swap = (
    <PoolSwapCard pool={selected} balance={balance} unsafe={poolTrust(selected) === 'unsafe'} onPlaced={placed} />
  );
  const info = <PoolInfoCard pool={selected} vault={selectedVault} />;
  return (
    <>
      {selected.verified ? (
        <div className={`${s.swapLayout} ${s.swapLayoutFill}`}>
          <div className={s.swapCol}>
            {swap}
            {info}
          </div>
          <SwapAside />
        </div>
      ) : (
        <div className={s.swapLayout}>
          <div className={s.swapCol}>{swap}</div>
          <div className={s.swapCol}>
            <VerifiedOnlyCard title="Price charts and recent activity are kept for verified pools only" />
            {info}
          </div>
        </div>
      )}
      <PoolOrdersCard pool={selected} version={version} />
    </>
  );
}

export function LiquidityPage() {
  const { isCanonical, selected } = useDex();
  const { balance, version, placed } = usePoolWallet();
  if (!selected) return null;
  if (isCanonical)
    return (
      <>
        <LiquidityPanel />
        <NftLookupCard />
      </>
    );
  return (
    <>
      <LiquidityModeBar />
      <div className={s.cols}>
        <PoolDepositCard pool={selected} balance={balance} unsafe={poolTrust(selected) === 'unsafe'} onPlaced={placed} />
        <PoolRedeemCard pool={selected} version={version} onPlaced={placed} />
      </div>
      <PoolOrdersCard pool={selected} version={version} />
      <NftLookupCard />
    </>
  );
}

/** Fee history is collected for verified pools only; an unverified pool shows how its fees split instead. */
export function HistoryPage() {
  const { selected, selectedVault } = useDex();
  if (!selected) return null;
  if (selected.verified) return <FeeHistoryPanel />;
  return (
    <div className={s.swapCol}>
      <VerifiedOnlyCard title="Fee history is kept for verified pools only" />
      <PoolInfoCard pool={selected} vault={selectedVault} wide />
    </div>
  );
}
