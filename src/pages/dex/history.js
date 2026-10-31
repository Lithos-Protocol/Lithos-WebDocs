import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import { HistoryPage } from '@site/src/components/Dex/PoolPages';

export default function DexHistoryPage() {
  return (
    <DexLayout title="History" description="Fees accumulated over time, pool-wide or per provision.">
      <HistoryPage />
    </DexLayout>
  );
}
