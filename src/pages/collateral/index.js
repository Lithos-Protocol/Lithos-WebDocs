import React from 'react';
import CollarLayout from '@site/src/components/Collateral/CollarLayout';
import OverviewPanel from '@site/src/components/Collateral/OverviewPanel';

export default function CollateralOverviewPage() {
  return (
    <CollarLayout
      title="Overview"
      description="The Lithos collateral market. An overview of emission, permits, rewards, and market standing."
    >
      <OverviewPanel />
    </CollarLayout>
  );
}
