/**
 * Folding a large package into blocks of transactions, so a hundred arb legs draw as a handful of blocks rather than
 * a hundred slabs.
 *
 * A kind with more than GROUP_SIZE members has them folded, GROUP_SIZE at a time in stack order, into one unit each;
 * whatever is left over stays single. A member whose proof leaf did not match, or whose size or cost the client did
 * not report, is never folded: those are the transactions worth seeing one by one, and a group's totals must be exact.
 */

export const GROUP_SIZE = 20;

/** Whether a transaction may go into a group: matched by the node's proof, with its size and cost known. */
export const foldable = (tx) => tx.proofLeafMatched !== false && tx.sizeBytes != null && tx.cost != null;

const sum = (members, pick) => members.reduce((total, tx) => total + BigInt(pick(tx) ?? 0), 0n);

function groupOf(members, ordinal, of, kindCount) {
  const first = members[0];
  const last = members[members.length - 1];
  return {
    id: `group:${first.kind}:${first.id}`,
    kind: first.kind,
    group: true,
    members,
    count: members.length,
    ordinal,
    of,
    kindCount,
    sizeBytes: Number(sum(members, (tx) => tx.sizeBytes)),
    cost: sum(members, (tx) => tx.cost).toString(),
    revenueNanoErg: sum(members, (tx) => tx.revenueNanoErg).toString(),
    proofLeafMatched: true,
    position: first.position,
    lastPosition: last.position,
  };
}

/**
 * The stack as drawing units, in the order given: single transactions as they are, and each group where its first
 * member sits. `txs` must already carry `position`, so a group can say which positions it covers.
 */
export function groupUnits(txs, size = GROUP_SIZE) {  const byKind = new Map();
  txs.forEach((tx) => {
    const list = byKind.get(tx.kind) ?? [];
    list.push(tx);
    byKind.set(tx.kind, list);
  });

  // Member -> the group it opens or joins, for the kinds big enough to fold.
  const folded = new Map();
  byKind.forEach((members, kind) => {
    if (members.length <= size) return;
    const eligible = members.filter(foldable);
    const groups = Math.floor(eligible.length / size);
    for (let g = 0; g < groups; g++) {
      const unit = groupOf(eligible.slice(g * size, (g + 1) * size), g + 1, groups, members.length);
      unit.members.forEach((tx, i) => folded.set(tx, i === 0 ? unit : null));
    }
  });

  if (folded.size === 0) return txs.map((tx) => ({ ...tx, group: false }));
  const units = [];
  txs.forEach((tx) => {
    if (!folded.has(tx)) units.push({ ...tx, group: false });
    else if (folded.get(tx)) units.push(folded.get(tx));
  });
  return units;
}
