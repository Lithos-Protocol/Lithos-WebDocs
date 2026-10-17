import React from 'react';
import ExtensionsLayout, { ForwardsNav } from '@site/src/components/Extensions/ExtensionsLayout';
import MarketPanel from '@site/src/components/Extensions/MarketPanel';
import OfferBook from '@site/src/components/Extensions/OfferBook';

export default function ForwardsMarketPage() {
  return (
    <ExtensionsLayout
      title="Difficulty Forwards"
      description="Bet on Ergo's average difficulty over a window of epochs, or hedge your mining income against it. Peer to peer, settled on chain in LIT."
    >
      <ForwardsNav />
      <MarketPanel />
      <OfferBook />
    </ExtensionsLayout>
  );
}
