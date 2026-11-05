import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import Guide from '@site/src/components/SigmaFi/Guide';

export default function SigmaFiGuidePage() {
  return (
    <SigmaFiLayout
      title="SigmaFi Bonds"
      description="Borrow or lend ERG and tokens against collateral, peer to peer. Repaid by a set block, or the collateral goes to the lender."
    >
      <Guide />
    </SigmaFiLayout>
  );
}
