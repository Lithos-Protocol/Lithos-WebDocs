import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import Book from '@site/src/components/SigmaFi/Book';

export default function SigmaFiBookPage() {
  return (
    <SigmaFiLayout
      title="Market"
      description="Peer-to-peer collateral-backed loans on Ergo."
    >
      <Book />
    </SigmaFiLayout>
  );
}
