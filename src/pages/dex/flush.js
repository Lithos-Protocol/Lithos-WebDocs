import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import FlushPanel from '@site/src/components/Dex/FlushPanel';

export default function DexFlushPage() {
  return (
    <DexLayout
      title="Flush"
      description="Move accrued pool fees into the LithosDex fee vault."
    >
      <FlushPanel />
    </DexLayout>
  );
}
