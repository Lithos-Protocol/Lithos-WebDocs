import React from 'react';
import ExtensionsLayout, { ForwardsNav } from '@site/src/components/Extensions/ExtensionsLayout';
import Guide from '@site/src/components/Extensions/Guide';

export default function ForwardsGuidePage() {
  return (
    <ExtensionsLayout
      title="How it works"
      description="How a difficulty forward is offered, filled, recorded and settled, and what it pays."
    >
      <ForwardsNav />
      <Guide />
    </ExtensionsLayout>
  );
}
