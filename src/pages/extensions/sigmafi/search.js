import React from 'react';
import SigmaFiLayout from '@site/src/components/SigmaFi/SigmaFiLayout';
import BondLookup from '@site/src/components/SigmaFi/BondLookup';

export default function SigmaFiSearchPage() {
  return <SigmaFiLayout title="Search" description="Look up a SigmaFi bond and follow its collateral."><BondLookup /></SigmaFiLayout>;
}
