import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import FlushPanel from '@site/src/components/Dex/FlushPanel';

export default function DexFlushPage() {
  return (
    <DexLayout
      title="Flush"
      description="Move this pool's pending fees into its vault."
    >
      <FlushPanel />
    </DexLayout>
  );
}
