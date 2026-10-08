import React from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import { fmtDuration, fmtInt } from './format';
import { NETWORKS, fmtConfigDiff } from './trade';

/**
 * The difficulty commitment, put into words once.
 *
 * The banner on every tab, the note on the super-share card and the Commitment tab all describe the
 * same `GET /mining/commitment` status, so they read it through these helpers and cannot disagree.
 */

export const COMMITMENT_PATH = '/mining/difficulty/commitment';

/** Milliseconds `blocks` take at `network`'s target block time. */
export const blocksMs = (blocks, network) =>
  blocks * (NETWORKS[network] ?? NETWORKS.MAINNET).blockSeconds * 1000;

/** "about 2h 6m" for a block count, or null when there is nothing to wait for. */
export function aboutBlocks(blocks, network) {
  if (!(blocks > 0)) return null;
  return `about ${fmtDuration(blocksMs(blocks, network))}`;
}

/** "block 1,234 (about 2h 6m from now)", dropping the wait once the tip has reached it. */
export function atBlock(height, tip, network) {
  if (height == null) return '—';
  const wait = tip != null ? aboutBlocks(height - tip, network) : null;
  return `block ${fmtInt(height)}${wait ? ` (${wait} from now)` : ''}`;
}

/** A score as a config-style diff, the way the rest of the page writes one. */
export const scoreDiff = (score) => (score == null ? '—' : fmtConfigDiff(Number(score)));

/** True only when a commitment is in force, which is what being paid depends on. */
export const isCommitted = (c) => c?.state === 'active';

/**
 * What to warn about when no commitment is in force, or null when one is. `tone` is `danger` while
 * nothing is on its way and `warn` while one is.
 */
export function commitmentWarning(c, network) {
  if (!c || isCommitted(c)) return null;
  const tip = c.height;
  if (c.state === 'unregistered') {
    return {
      tone: 'danger',
      title: 'Your difficulty is not committed',
      body: 'This miner has no difficulty commitment on chain, so it cannot submit NISPs and is not paid for any block.',
      cta: 'Commit a difficulty',
    };
  }
  if (c.state === 'registering' || c.state === 'waiting') {
    const next = c.pending ?? c.inFlight?.commitment;
    const body = next
      ? `${scoreDiff(next.score)} takes effect at ${atBlock(next.inForceFromHeight, tip, network)}. ` +
        'Until then this miner cannot submit NISPs and is not paid.'
      : `Registered, and waiting for the client to record it. ${c.reason ?? ''}`.trim();
    return {
      tone: 'warn',
      title: c.state === 'registering' ? 'Your difficulty commitment is registering' : 'Your difficulty commitment is not active yet',
      body,
      cta: 'View commitment',
    };
  }
  return {
    tone: 'warn',
    title: 'Could not confirm your difficulty commitment',
    body: c.reason ?? 'The client could not read it.',
    cta: 'View commitment',
  };
}

/** Shown under the header on every Mining tab while no commitment is in force. */
export function CommitmentBanner({ commitment, network }) {
  const { pathname } = useLocation();
  const here = pathname.replace(/\/+$/, '').endsWith(COMMITMENT_PATH);
  const w = commitmentWarning(commitment, network);
  if (!w) return null;
  return (
    <div className={`${s.commitBanner} ${w.tone === 'danger' ? s.commitBannerDanger : ''}`} role="alert">
      <span className={s.commitBannerIcon} aria-hidden="true">!</span>
      <div className={s.commitBannerText}>
        <span className={s.commitBannerTitle}>{w.title}</span>
        <span>{w.body}</span>
      </div>
      {!here && (
        <Link className={s.commitBannerCta} to={COMMITMENT_PATH}>
          {w.cta} →
        </Link>
      )}
    </div>
  );
}

/** The super-share card's version: what the shares above it are worth without a commitment. */
export function SuperShareCommitmentNote({ commitment, network }) {
  if (!commitment || isCommitted(commitment)) return null;
  const next = commitment.pending ?? commitment.inFlight?.commitment;
  let text;
  if (commitment.state === 'unregistered') {
    text = 'Your difficulty is not committed, so these super shares cannot go into a NISP and earn nothing.';
  } else if (next) {
    text = `Your commitment takes effect at ${atBlock(next.inForceFromHeight, commitment.height, network)}. ` +
      'You do not earn rewards until it does.';
  } else {
    text = 'Your difficulty commitment could not be confirmed, so these super shares may earn nothing.';
  }
  return (
    <div className={s.warnNote} style={{ marginTop: 0, marginBottom: 12 }}>
      <span>
        {text}{' '}
        <Link to={COMMITMENT_PATH} className={s.warnLink}>
          Commitment →
        </Link>
      </span>
    </div>
  );
}

const SUB_TABS = [
  { to: '/mining/difficulty', label: 'Calculator', exact: true },
  { to: COMMITMENT_PATH, label: 'Commitment' },
];

/** The Difficulty tab's two pages. The Commitment tab carries a dot while nothing is in force. */
export function DifficultyTabs({ commitment }) {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (p) => p.replace(/\/+$/, '') || '/';
  const cur = strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/');
  const warn = commitment && !isCommitted(commitment);
  return (
    <div className={s.subTabs} role="tablist">
      {SUB_TABS.map((t) => {
        const active = t.exact ? cur === strip(t.to) : cur.startsWith(strip(t.to));
        return (
          <Link
            key={t.to}
            to={t.to}
            role="tab"
            aria-selected={active}
            className={`${s.subTab} ${active ? s.subTabActive : ''}`}
          >
            {t.label}
            {t.to === COMMITMENT_PATH && warn && (
              <span
                className={`${s.subTabDot} ${commitment.state === 'unregistered' ? s.subTabDotDanger : ''}`}
                title="No commitment in force"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
