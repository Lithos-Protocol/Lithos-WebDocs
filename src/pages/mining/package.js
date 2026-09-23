import React from 'react';
import MiningLayout from '@site/src/components/Mining/MiningLayout';
import BlockPackagePanel from '@site/src/components/Mining/BlockPackagePanel';

export default function MiningPackagePage() {
  return (
    <MiningLayout
      title="Block package"
      description="The Stratum job being served right now, and what this client put inside it."
    >
      <BlockPackagePanel />
    </MiningLayout>
  );
}
