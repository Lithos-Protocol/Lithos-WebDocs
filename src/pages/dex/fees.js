import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import ProvisionFeesPanel from '@site/src/components/Dex/ProvisionFeesPanel';

export default function DexFeesPage() {
  return (
    <DexLayout
      title="Fees"
      description="Outstanding fees for each of your liquidity provisions."
    >
      <ProvisionFeesPanel />
    </DexLayout>
  );
}
