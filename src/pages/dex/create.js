import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import CreatePoolPanel from '@site/src/components/Dex/CreatePoolPanel';

export default function DexCreatePage() {
  return (
    <DexLayout title="Create a pool" description="Create a LithosDex pool from your wallet." pooled={false}>
      <CreatePoolPanel />
    </DexLayout>
  );
}
