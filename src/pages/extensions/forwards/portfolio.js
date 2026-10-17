import React from 'react';
import ExtensionsLayout, { ForwardsNav } from '@site/src/components/Extensions/ExtensionsLayout';
import Portfolio from '@site/src/components/Extensions/Portfolio';

export default function ForwardsPortfolioPage() {
  return (
    <ExtensionsLayout
      title="Portfolio"
      description="Your open positions marked against the strike, the offers you are waiting on, and what every settled position paid."
    >
      <ForwardsNav />
      <Portfolio />
    </ExtensionsLayout>
  );
}
