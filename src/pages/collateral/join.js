import React from 'react';
import CollarLayout from '@site/src/components/Collateral/CollarLayout';
import JoinPanel from '@site/src/components/Collateral/JoinPanel';

export default function CollateralJoinPage() {
  return (
    <CollarLayout
      title="Join"
      description="Post collateral and take a place in the queue. Spends real ERG."
    >
      <JoinPanel />
    </CollarLayout>
  );
}
