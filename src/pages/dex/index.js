import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import { SwapPage } from '@site/src/components/Dex/PoolPages';

export default function DexSwapPage() {
  return (
    <DexLayout title="Swap" description="Trade on any LithosDex pool. ERG:LIT is shown unless you pick another.">
      <SwapPage />
    </DexLayout>
  );
}
