import React from 'react';
import MiningLayout, { useMining } from '@site/src/components/Mining/MiningLayout';
import CommitmentPanel from '@site/src/components/Mining/CommitmentPanel';
import { DifficultyTabs } from '@site/src/components/Mining/commitment';

function Commitment() {
  const { commitment } = useMining();
  return (
    <>
      <DifficultyTabs commitment={commitment} />
      <CommitmentPanel />
    </>
  );
}

export default function MiningCommitmentPage() {
  return (
    <MiningLayout
      title="Commitment"
      description="Commit your diff on chain: what is in force, what is coming, and when you can change it."
    >
      <Commitment />
    </MiningLayout>
  );
}
