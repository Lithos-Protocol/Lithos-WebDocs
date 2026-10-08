import React from 'react';
import MiningLayout, { useMining } from '@site/src/components/Mining/MiningLayout';
import DifficultyPanel from '@site/src/components/Mining/DifficultyPanel';
import { DifficultyTabs } from '@site/src/components/Mining/commitment';

function Calculator() {
  const { commitment } = useMining();
  return (
    <>
      <DifficultyTabs commitment={commitment} />
      <DifficultyPanel />
    </>
  );
}

export default function MiningDifficultyPage() {
  return (
    <MiningLayout
      title="Difficulty"
      description="Pick a diff from your hashrate: how often each choice pays, and what it earns."
    >
      <Calculator />
    </MiningLayout>
  );
}
