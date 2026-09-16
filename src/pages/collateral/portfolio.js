import React from 'react';
import CollarLayout from '@site/src/components/Collateral/CollarLayout';
import PortfolioPanel from '@site/src/components/Collateral/PortfolioPanel';

export default function CollateralPortfolioPage() {
  return (
    <CollarLayout
      title="Your position"
      description="Your balances, lender keys, queued and live positions, and locked mining rewards."
    >
      <PortfolioPanel />
    </CollarLayout>
  );
}
