import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import PoolsPanel from '@site/src/components/Dex/PoolsPanel';

export default function DexPoolsPage() {
  return (
    <DexLayout title="Pools" description="Every LithosDex pool, ERG/token and token/token." pooled={false}>
      <PoolsPanel />
    </DexLayout>
  );
}
