import React from 'react';
import MiningLayout from '@site/src/components/Mining/MiningLayout';
import HashratePanel from '@site/src/components/Mining/HashratePanel';

export default function MiningHashratePage() {
  return (
    <MiningLayout
      title="Hashrate"
      description="Network and Lithos hashrate, the difficulty curve by epoch, and what your own workers are contributing."
    >
      <HashratePanel />
    </MiningLayout>
  );
}
