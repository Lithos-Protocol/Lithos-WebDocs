import React from 'react';
import ExtensionsLayout, { ForwardsNav } from '@site/src/components/Extensions/ExtensionsLayout';
import MarketPanel from '@site/src/components/Extensions/MarketPanel';
import OfferBook from '@site/src/components/Extensions/OfferBook';

export default function ForwardsMarketPage() {
  return (
    <ExtensionsLayout
      title="Difficulty Forwards"
      description="Trade Ergo difficulty with peer-to-peer forwards settled in LIT."
    >
      <ForwardsNav />
      <MarketPanel />
      <OfferBook />
    </ExtensionsLayout>
  );
}
