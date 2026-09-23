import React from 'react';
import MiningLayout from '@site/src/components/Mining/MiningLayout';
import DifficultyPanel from '@site/src/components/Mining/DifficultyPanel';

export default function MiningDifficultyPage() {
  return (
    <MiningLayout
      title="Difficulty"
      description="Pick a diff from your hashrate: how often each choice pays, and what it earns."
    >
      <DifficultyPanel />
    </MiningLayout>
  );
}
