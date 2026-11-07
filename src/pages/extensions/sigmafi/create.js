import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import Create from '@site/src/components/SigmaFi/Create';

export default function SigmaFiCreatePage() {
  return (
    <SigmaFiLayout
      title="Borrow"
      description="Peer-to-peer collateral-backed loans on Ergo."
    >
      <Create />
    </SigmaFiLayout>
  );
}
