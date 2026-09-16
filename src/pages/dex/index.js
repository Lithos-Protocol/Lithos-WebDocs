import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import SwapPanel from '@site/src/components/Dex/SwapPanel';

export default function DexSwapPage() {
  return (
    <DexLayout title="Swap" description="Trade ERG against the pool token on LithosDex.">
      <SwapPanel />
    </DexLayout>
  );
}
