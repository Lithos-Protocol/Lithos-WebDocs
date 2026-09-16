import React from 'react';
import CollarLayout from '@site/src/components/Collateral/CollarLayout';
import ActiveSetPanel from '@site/src/components/Collateral/ActiveSetPanel';
import QueuePanel from '@site/src/components/Collateral/QueuePanel';

/**
 * Queue status — the active set and the queue on one page.
 *
 * The two were separate subpages, but the queue is a single table and the two
 * halves only make sense together: the queue's head activates into a slot the
 * active set frees. Reading order follows that flow — what is live now, then
 * what is waiting to get in.
 */
export default function CollateralQueueStatusPage() {
  return (
    <CollarLayout
      title="Queue status"
      description="What is live now and who is waiting for activation: the collateral set, and the queue that feeds it."
    >
      <ActiveSetPanel />
      {/* Matches the gap ActiveSetPanel puts between its own stacked cards. */}
      <div style={{ marginTop: '1.25rem' }}>
        <QueuePanel />
      </div>
    </CollarLayout>
  );
}
