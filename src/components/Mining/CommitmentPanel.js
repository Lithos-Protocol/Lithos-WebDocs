import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
/* Form chrome is borrowed from the Collateral stylesheet, as the settings panel does. */
import f from '../Collateral/styles.module.css';
import * as api from './api';
import { useMining } from './MiningLayout';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import { fmtDuration, fmtInt, shortId } from './format';
import { NETWORKS, parseConfigDiff } from './trade';
import { aboutBlocks, atBlock, blocksMs, scoreDiff } from './commitment';

/** The protocol's timing, shown until the client's own answer arrives. */
const DEFAULT_TIMING = {
  servedAfterBlocks: 63,
  inForceAfterBlocks: 125,
  replaceableAfterBlocks: 845,
  windowBlocks: 60,
  rollupLifetimeBlocks: 720,
};

/** A registration locks the data box's minimum value and pays one network fee; a change pays the fee. */
const DATA_BOX_ERG = '0.001';
const FEE_ERG = '0.001';

const STATE = {
  active: { text: 'Active', tone: 'statePillOk' },
  waiting: { text: 'Not active yet', tone: 'statePillWarn' },
  registering: { text: 'Registering', tone: 'statePillWarn' },
  unregistered: { text: 'Not committed', tone: 'statePillDanger' },
  unknown: { text: 'Unknown', tone: 'statePillWarn' },
};

/** Why the send control is off, in the reader's terms. Keyed by the status's `blockedReason`. */
const BLOCK_COPY = {
  AUTO_COMMIT: (c) => ({
    title: 'Auto-commit is on',
    body: (
      <>
        <code>state.autoCommit</code> keeps your commitment at your config diff,{' '}
        <code>{c.configDiff}</code>. Change <code>stratum.diff</code> and restart the client, or set{' '}
        <code>state.autoCommit = false</code> to commit from here.
      </>
    ),
  }),
  TRANSFORMS_DISABLED: () => ({
    title: 'Rollup work is switched off',
    body: (
      <>
        <code>state.disableTransforms</code> is true in your config, so this client sends no
        registration or commitment.
      </>
    ),
  }),
  IN_FLIGHT: (c) => ({
    title: 'A commitment is on its way',
    body: `Your ${c.inFlight?.kind ?? 'last'} transaction has not settled yet. You can send another once it confirms and the client has synced it.`,
  }),
  LOCKED: (c, network) => ({
    title: 'Your commitment is locked',
    body: `You can change it from ${atBlock(c.replaceableFromHeight, c.height, network)}.`,
  }),
  SYNCING: (c) => ({
    title: 'Waiting for the client to sync',
    body: c.reason ?? 'The client is still syncing the Miner Dictionary.',
  }),
  UNAVAILABLE: (c) => ({
    title: 'Your commitment could not be read',
    body: c.reason ?? 'The client could not read your commitment from the node.',
  }),
};

/** One commitment slot: in force, or upcoming. */
function Slot({ label, entry, tip, network, empty, upcoming }) {
  return (
    <div className={`${s.commitSlot} ${entry ? '' : s.commitSlotEmpty} ${entry && !upcoming ? s.commitSlotKey : ''}`}>
      <span className={s.label}>{label}</span>
      <span className={s.commitSlotDiff}>{entry ? scoreDiff(entry.score) : '—'}</span>
      {entry ? (
        <>
          <span className={s.calcDim}>score {fmtInt(entry.score)}</span>
          {upcoming ? (
            <p className={s.diffNote}>
              {entry.servedFromHeight != null && (
                <>
                  Your rigs mine at it from {atBlock(entry.servedFromHeight, tip, network)}.{' '}
                </>
              )}
              In force, and paid at, from {atBlock(entry.inForceFromHeight, tip, network)}.
            </p>
          ) : (
            <p className={s.diffNote}>
              In force since block {fmtInt(entry.inForceFromHeight)}. Your NISPs are judged against it.
            </p>
          )}
        </>
      ) : (
        <p className={s.diffNote}>{empty}</p>
      )}
    </div>
  );
}

/** What is on chain now: in force, upcoming, in flight, and when it unlocks. */
function StatusCard({ c, network }) {
  const state = STATE[c?.state] ?? STATE.unknown;
  const tip = c?.height;
  const flight = c?.inFlight;
  const lockLeft = c?.replaceableFromHeight != null && tip != null ? c.replaceableFromHeight - tip : null;

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Your commitment</h3>
        {c ? <span className={`${s.statePill} ${s[state.tone]}`}>{state.text}</span> : <Spinner />}
      </div>

      <div className={s.commitSlots}>
        <Slot
          label="In force"
          entry={c?.inForce}
          tip={tip}
          network={network}
          empty="Nothing is in force, so this miner cannot submit NISPs and is not paid."
        />
        <Slot
          label={!c?.pending && flight ? 'Upcoming · unconfirmed' : 'Upcoming'}
          entry={c?.pending ?? flight?.commitment}
          tip={tip}
          network={network}
          upcoming
          empty="No change is waiting to take effect."
        />
      </div>

      <div className={s.rows} style={{ marginTop: 14 }}>
        {flight && (
          <div className={s.kv}>
            <span className={s.kvKey}>Sent, not yet settled</span>
            <span className={s.kvVal} title={flight.txId}>
              {flight.kind} to {scoreDiff(flight.commitment.score)} · {shortId(flight.txId)}
              {flight.confirmedHeight != null ? ` · confirmed at ${fmtInt(flight.confirmedHeight)}` : ' · unconfirmed'}
            </span>
          </div>
        )}
        <div className={s.kv}>
          <span className={s.kvKey}>Can change</span>
          <span className={s.kvVal}>
            {c?.replaceableFromHeight == null
              ? c?.state === 'unregistered'
                ? 'now'
                : '—'
              : lockLeft > 0
                ? `from block ${fmtInt(c.replaceableFromHeight)}, ${aboutBlocks(lockLeft, network)}`
                : 'now'}
          </span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Chain tip</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>{tip != null ? `block ${fmtInt(tip)}` : '—'}</span>
        </div>
        <div className={s.kv}>
          <span className={s.kvKey}>Config diff</span>
          <span className={`${s.kvVal} ${s.kvValDim}`}>
            {c?.configDiff ?? '—'}
            {c?.autoCommit ? ' · auto-commit on' : ''}
          </span>
        </div>
      </div>

      {c?.state === 'unknown' && c.reason && <div className={s.warnNote}>{c.reason}</div>}
      {!c && (
        <p className={s.cardNote} style={{ marginTop: 12 }}>
          Waiting for the client to report your commitment.
        </p>
      )}
    </div>
  );
}

/** The heights a commitment sent at `tip` would act at, as `GET /mining/commitment` times them. */
function preview(tip, timing, cut) {
  return {
    served: tip + (cut ? timing.inForceAfterBlocks : timing.servedAfterBlocks),
    inForce: tip + timing.inForceAfterBlocks,
    payout: tip + timing.inForceAfterBlocks + timing.rollupLifetimeBlocks,
    unlock: tip + timing.replaceableAfterBlocks,
  };
}

/** The form: a diff, what sending it now would mean, and the send. */
function CommitForm({ c, network, onSent }) {
  const [text, setText] = useState('');
  const [keyText, setKeyText] = useState('');
  const [ack, setAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const timing = c?.timing ?? DEFAULT_TIMING;
  const registering = c?.state === 'unregistered';
  const value = parseConfigDiff(text);
  const typed = text.trim() !== '';
  const newest = c?.pending ?? c?.inForce;
  const newestScore = newest ? Number(newest.score) : null;
  const same = value != null && newestScore != null && Math.abs(value - newestScore) <= newestScore * 1e-6;
  const cut = value != null && newestScore != null && value < newestScore;
  const tip = c?.height;
  const at = value != null && tip != null ? preview(tip, timing, cut) : null;
  const hasKey = api.hasApiKey();
  const blocked = c && !c.canCommit ? (BLOCK_COPY[c.blockedReason] ?? BLOCK_COPY.UNAVAILABLE)(c, network) : null;
  const canSend = !!c && c.canCommit && value != null && !same && ack && !submitting && (hasKey || keyText.trim() !== '');

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      if (!hasKey) api.setApiKey(keyText);
      const r = await api.postCommitment(text.trim());
      setResult(r);
      setText('');
      setAck(false);
    } catch (e) {
      // A key typed here and refused must not stay set, or its field disappears with no way to fix it.
      if (!hasKey && e.status === 403) api.setApiKey('');
      setError(e.message);
    } finally {
      setSubmitting(false);
      onSent();
    }
  };

  const when = (height) => (tip != null ? `block ${fmtInt(height)}, ${aboutBlocks(height - tip, network)}` : '—');

  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>
          {registering || c?.state === 'registering' ? 'Commit a difficulty' : 'Change your commitment'}
        </h3>
        <span className={s.label}>{registering ? 'registers this miner' : 'replaces the newest'}</span>
      </div>

      <label className={s.calcField}>
        <span className={s.label}>New diff</span>
        <input
          className={`${s.calcInput} ${typed && value == null ? s.calcInputBad : ''}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAck(false);
          }}
          placeholder={c?.configDiff ? `e.g. ${c.configDiff}` : 'e.g. 1.5M'}
          spellCheck={false}
          autoComplete="off"
        />
        <span className={s.calcEcho}>
          {value != null
            ? same
              ? `Already your newest commitment, ${scoreDiff(newestScore)}.`
              : `Score ${fmtInt(Math.round(value))}${newest ? `, ${cut ? 'a cut' : 'a raise'} from ${scoreDiff(newestScore)}` : ''}.`
            : typed
              ? 'Write it like stratum.diff: a number and K, M, G, T or P, such as 1.5M.'
              : <>
                  Pick one on the <Link to="/mining/difficulty">Calculator</Link> tab.
                  {c?.configDiff && (
                    <>
                      {' '}
                      <button type="button" className={f.linkBtn} onClick={() => setText(c.configDiff)}>
                        Use your config diff, {c.configDiff}
                      </button>
                    </>
                  )}
                </>}
        </span>
      </label>

      {at && !same && (
        <div className={s.rows} style={{ marginTop: 14 }}>
          <span className={s.label}>If sent now, at block {fmtInt(tip)}</span>
          <div className={s.kv}>
            <span className={s.kvKey}>Rigs mine at it</span>
            <span className={s.kvVal}>{when(at.served)}</span>
          </div>
          <div className={s.kv}>
            <span className={s.kvKey}>In force, paid at it</span>
            <span className={s.kvVal}>{when(at.inForce)}</span>
          </div>
          <div className={s.kv}>
            <span className={s.kvKey}>First payout at it</span>
            <span className={s.kvVal}>{when(at.payout)}</span>
          </div>
          <div className={s.kv}>
            <span className={s.kvKey}>Locked until</span>
            <span className={s.kvVal}>{when(at.unlock)}</span>
          </div>
          <div className={s.kv}>
            <span className={s.kvKey}>Cost</span>
            <span className={`${s.kvVal} ${s.kvValDim}`}>
              {registering
                ? `${DATA_BOX_ERG} ERG locked in your data box + ${FEE_ERG} ERG fee`
                : `${FEE_ERG} ERG fee`}
            </span>
          </div>
        </div>
      )}

      {blocked && (
        <Alert kind="warn" title={blocked.title}>
          {blocked.body}
        </Alert>
      )}

      {!blocked && (
        <>
          {!hasKey && (
            <label className={s.calcField} style={{ marginTop: 14 }}>
              <span className={s.label}>API key</span>
              <input
                className={s.calcInput}
                type="password"
                value={keyText}
                onChange={(e) => setKeyText(e.target.value)}
                placeholder="needed to send; kept until you refresh"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          )}

          {at && !same && (
            <label className={f.settingCheck} style={{ marginTop: 14, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              I understand {scoreDiff(value)} cannot be changed until block {fmtInt(at.unlock)}, about{' '}
              {fmtDuration(blocksMs(timing.replaceableAfterBlocks, network))} from now.
            </label>
          )}

          <button type="button" className={f.btn} disabled={!canSend} onClick={submit}>
            {submitting
              ? 'Sending…'
              : value != null && !same
                ? `${registering ? 'Register and commit' : 'Commit'} ${scoreDiff(value)}`
                : registering
                  ? 'Register and commit'
                  : 'Commit'}
          </button>
        </>
      )}

      {error && (
        <Alert kind="error" title="Nothing was committed">
          {error}
        </Alert>
      )}
      {result && (
        <TxResult
          title={result.kind === 'registration' ? 'Registration sent' : 'Commitment change sent'}
          outcome={result.outcome}
          txId={result.txId}
          rows={[
            ['Diff', scoreDiff(result.score)],
            ['Rigs mine at it from', `block ${fmtInt(result.servedFromHeight)}`],
            ['In force from', `block ${fmtInt(result.inForceFromHeight)}`],
            ['Can change again from', `block ${fmtInt(result.replaceableFromHeight)}`],
          ]}
        />
      )}
    </div>
  );
}

/** The three waits a miner plans around, then the order they happen in. */
function HowItWorks({ timing, network }) {
  const net = NETWORKS[network] ?? NETWORKS.MAINNET;
  const t = (blocks) => fmtDuration(blocksMs(blocks, network));
  const payout = timing.inForceAfterBlocks + timing.rollupLifetimeBlocks;

  const steps = [
    { at: 0, label: 'You commit' },
    { at: timing.servedAfterBlocks, label: 'Rigs switch to it' },
    { at: timing.inForceAfterBlocks, label: 'In force, paid at it' },
    { at: timing.replaceableAfterBlocks, label: 'Unlocked' },
  ];

  return (
    <div className={`${s.card} ${s.stackGap}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>How difficulty commitments work</h3>
        <span className={s.label}>times at {net.blockSeconds}s blocks · {net.label.toLowerCase()}</span>
      </div>

      <p className={s.commitLead}>
        Your diff goes on chain before you mine at it, so no one can pick their score after seeing their
        shares. Each NISP the client submits uses the diff in force. Times count from the block you
        commit at.
      </p>

      <div className={s.picks}>
        <div className={s.pick}>
          <span className={s.label}>Start mining at it</span>
          <span className={s.pickDiff}>{fmtInt(timing.servedAfterBlocks)} blocks</span>
          <span className={s.calcDim}>about {t(timing.servedAfterBlocks)}</span>
          <p className={s.diffNote}>A lower diff waits until it is in force.</p>
        </div>
        <div className={`${s.pick} ${s.pickStart}`}>
          <span className={s.label}>Start getting paid</span>
          <span className={s.pickDiff}>{fmtInt(timing.inForceAfterBlocks)} blocks</span>
          <span className={s.calcDim}>about {t(timing.inForceAfterBlocks)}</span>
          <p className={s.diffNote}>
            First payout about {fmtInt(payout)} blocks ({t(payout)}) in, when the first rollup that took
            your NISPs pays.
          </p>
        </div>
        <div className={s.pick}>
          <span className={s.label}>Locked for</span>
          <span className={s.pickDiff}>{fmtInt(timing.replaceableAfterBlocks)} blocks</span>
          <span className={s.calcDim}>about {t(timing.replaceableAfterBlocks)}</span>
          <p className={s.diffNote}>A change sent after that binds {fmtInt(timing.inForceAfterBlocks)} blocks later.</p>
        </div>
      </div>

      <ol className={s.commitSteps}>
        {steps.map((st) => (
          <li key={st.at} className={s.commitStep}>
            <span className={s.commitStepDot} aria-hidden="true" />
            <span className={s.commitStepAt}>{st.at === 0 ? 'block h' : `h + ${fmtInt(st.at)}`}</span>
            <span className={s.commitStepLabel}>{st.label}</span>
          </li>
        ))}
      </ol>

      <ul className={s.commitList}>
        <li>Nothing you mine counts toward a NISP before your first commitment is in force.</li>
        <li>
          Registering costs {DATA_BOX_ERG} ERG locked in your data box plus a {FEE_ERG} ERG fee. A change
          costs the fee.
        </li>
        <li>
          With <code>state.autoCommit</code> on, the client commits <code>stratum.diff</code> itself and
          this page cannot commit.
        </li>
      </ul>
    </div>
  );
}

export default function CommitmentPanel() {
  const { commitment, network, refreshCommitment } = useMining();
  const timing = commitment?.timing ?? DEFAULT_TIMING;

  return (
    <>
      <div className={s.split} style={{ marginTop: 0 }}>
        <StatusCard c={commitment} network={network} />
        <CommitForm c={commitment} network={network} onSent={refreshCommitment} />
      </div>
      <HowItWorks timing={timing} network={network} />
    </>
  );
}
