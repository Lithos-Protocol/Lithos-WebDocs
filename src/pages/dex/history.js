import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import FeeHistoryPanel from '@site/src/components/Dex/FeeHistoryPanel';

export default function DexHistoryPage() {
  return (
    <DexLayout
      title="History"
      description="Fees accumulated over time, pool-wide or per provision."
    >
      <FeeHistoryPanel />
    </DexLayout>
  );
}
