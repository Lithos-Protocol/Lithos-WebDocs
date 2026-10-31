import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import { LiquidityPage } from '@site/src/components/Dex/PoolPages';

export default function DexLiquidityPage() {
  return (
    <DexLayout title="Liquidity" description="Deposit into a pool or close one of your provisions.">
      <LiquidityPage />
    </DexLayout>
  );
}
