import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import LiquidityPanel from '@site/src/components/Dex/LiquidityPanel';

export default function DexLiquidityPage() {
  return (
    <DexLayout
      title="Liquidity"
      description="Deposit into the pool or close a provision on LithosDex."
    >
      <LiquidityPanel />
    </DexLayout>
  );
}
