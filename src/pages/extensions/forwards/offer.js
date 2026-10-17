import React from 'react';
import ExtensionsLayout, { ForwardsNav } from '@site/src/components/Extensions/ExtensionsLayout';
import OfferForm from '@site/src/components/Extensions/OfferForm';

export default function ForwardsOfferPage() {
  return (
    <ExtensionsLayout
      title="Make an offer"
      description="Pick a side, a window and a strike. Your offer waits for a taker until the end of this epoch."
    >
      <ForwardsNav />
      <OfferForm />
    </ExtensionsLayout>
  );
}
