import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import Book from '@site/src/components/SigmaFi/Book';

export default function SigmaFiBookPage() {
  return (
    <SigmaFiLayout
      title="SigmaFi Bonds"
      description="Borrow or lend ERG and tokens against collateral, peer to peer. Repaid by a set block, or the collateral goes to the lender."
    >
      <Book />
    </SigmaFiLayout>
  );
}
