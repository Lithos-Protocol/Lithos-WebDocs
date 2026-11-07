import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import Portfolio from '@site/src/components/SigmaFi/Portfolio';

export default function SigmaFiPortfolioPage() {
  return (
    <SigmaFiLayout
      title="Portfolio"
      description="Peer-to-peer collateral-backed loans on Ergo."
    >
      <Portfolio />
    </SigmaFiLayout>
  );
}
