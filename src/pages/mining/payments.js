import React from 'react';
import MiningLayout from '@site/src/components/Mining/MiningLayout';
import PaymentsPanel from '@site/src/components/Mining/PaymentsPanel';

export default function MiningPaymentsPage() {
  return (
    <MiningLayout
      title="Payments"
      description="What this client has been paid, what each payout was made of, and what is still on its way."
    >
      <PaymentsPanel />
    </MiningLayout>
  );
}
