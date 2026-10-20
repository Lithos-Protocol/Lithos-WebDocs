import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import { useExtensions } from './ExtensionsLayout';
import { PayoutCurve } from './charts';
import { Kpi, SideChip } from './ui';
import {
  ACC_DEPOSIT,
  COLORS,
  fmtDifficulty,
  fmtInt,
  fmtLit,
  fmtLitFull,
  fmtLitSigned,
  fmtMove,
  fmtSpan,
  litText,
  marginOf,
  notionalFor,
  parseLit,
  payoutAt,
  perPercent,
  RECORD_REWARD,
  scaleDifficulty,
  SETTLE_REWARD,
  SIDE_REWARD,
} from './format';

const STEPS = [
  {
    n: 1,
    title: 'Offer',
    text: `A maker picks a side, a strike difficulty, a window of 1 to 120 epochs (about 4 hours to 3 weeks) and a margin, and locks the margin plus ${litText(SIDE_REWARD)} of fees.`,
  },
  {
    n: 2,
    title: 'Fill',
    text: 'A taker takes the other side and locks the same margin. The window starts at least 2 epochs after the fill to prevent manipulation.',
  },
  {
    n: 3,
    title: 'Record',
    text: `Once per epoch, anyone writes the difficulty into the accumulator, a shared on-chain record of the last 128 epochs, and earns ${litText(RECORD_REWARD)} for it. Lithos clients do this on their own.`,
  },
  {
    n: 4,
    title: 'Settle',
    text: `Once the window’s last epoch is recorded, anyone may settle the contract for ${litText(SETTLE_REWARD)}. Each 1% difference between the window’s average and the strike results in a 5% profit or loss for each party.`,
  },
];

/** The words the rest of the section uses, for someone new to this kind of bet. */
const TERMS = [
  ['Epoch', 'Ergo sets a new difficulty every 128 blocks, about 4.3 hours. Each stretch of 128 blocks is an epoch. Tick Block heights at the top to see blocks instead.'],
  ['Window', 'How many epochs to bet over. The average difficulty over the total window of epochs decides the bet.'],
  ['Strike', 'The difficulty the window’s average is measured against.'],
  ['Long and short', 'Going long wins if Ergo\'s network difficulty ends above the strike, while going short wins if it ends below the strike.'],
  ['Margin', 'Each side’s stake, and the most either can win or lose. A 1% change in average network difficulty results in a 5% gain or loss.'],
  ['Fees', `${litText(SIDE_REWARD)} from each side: ${litText(ACC_DEPOSIT / 2n)} keeps the difficulty record going, ${litText(SETTLE_REWARD / 2n)} pays whoever settles. They are not returned.`],
];

const HEDGE = [
  { move: 0.08, label: '+8%' },
  { move: -0.08, label: '-8%' },
  { move: 0.3, label: '+30%' },
];

/** The payout explorer: pick a side, a size and where the window lands, and read what each side receives. */
function Explorer({ base }) {
  const [long, setLong] = useState(true);
  const [marginText, setMarginText] = useState('2000');
  const [outcome, setOutcome] = useState(0.05);
  const margin = parseLit(marginText) ?? 0n;
  const n = notionalFor(margin);
  const strike = base;
  const mean = strike ? scaleDifficulty(strike, outcome) : null;
  const p = strike && n > 0n ? payoutAt(mean, strike, n) : 0n;
  const mine = long ? p : -p;

  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>Try it</h3>
        <div className={m.controls}>
          <div className={m.seg}>
            {[true, false].map((isLong) => (
              <button key={String(isLong)} type="button" className={`${m.segBtn} ${long === isLong ? m.segBtnOn : ''}`} onClick={() => setLong(isLong)}>
                {isLong ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
          <span className={s.unitInput}>
            <input value={marginText} onChange={(e) => setMarginText(e.target.value)} inputMode="decimal" aria-label="Margin in LIT" />
            <i>LIT margin</i>
          </span>
        </div>
      </div>
      <div className={s.explorer}>
        <div>
          <PayoutCurve
            long={long}
            strike={strike}
            notional={n}
            height={210}
            marks={[{ move: outcome, label: 'window average', color: COLORS.next }]}
          />
          <div className={s.fieldHead} style={{ marginTop: 8 }}>
            <span className={m.label}>The window's average ends</span>
            <span className={s.fieldValue}>{fmtMove(outcome, 1)} against the strike</span>
          </div>
          <input
            type="range"
            className={s.range}
            min={-30}
            max={30}
            step={0.5}
            value={outcome * 100}
            onChange={(e) => setOutcome(Number(e.target.value) / 100)}
            aria-label="Where the window's mean difficulty lands"
          />
        </div>
        <div className={s.explorerSide}>
          <SideChip side={long ? 'long' : 'short'} prefix="you are " />
          <div className={s.quoteRows}>
            <div className={m.kv}>
              <span className={m.kvKey}>Strike</span>
              <span className={m.kvVal}>{strike ? fmtDifficulty(strike, 2) : '—'}</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Window average</span>
              <span className={m.kvVal}>{mean ? fmtDifficulty(mean, 2) : '—'}</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Your margin</span>
              <span className={m.kvVal}>{fmtLit(margin, 2)} LIT</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Won from the other side</span>
              <span className={m.kvVal} style={{ color: mine >= 0n ? COLORS.gain : COLORS.loss }}>
                {fmtLitSigned(mine)} LIT
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>You receive</span>
              <span className={m.kvVal}>{fmtLit(margin + mine, 2)} LIT</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Net, after {litText(SIDE_REWARD)} of fees</span>
              <span className={m.kvVal} style={{ color: mine - SIDE_REWARD >= 0n ? COLORS.gain : COLORS.loss }}>
                {fmtLitSigned(mine - SIDE_REWARD)} LIT
              </span>
            </div>
          </div>
          <p className={m.cardNote}>
            {fmtLit(perPercent(margin), 2)} LIT for each 1% move, {fmtMove(Math.max(-0.2, Math.min(0.2, outcome)), 1)} here
            {Math.abs(outcome) > 0.2 ? ', held at the 20% limit where the whole margin has moved' : ''}.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Guide() {
  const { acc, heights } = useExtensions();
  const base = acc?.currentDifficulty;
  const hedge = useMemo(
    () =>
      HEDGE.map((h) => {
        const position = Math.max(-0.2, Math.min(0.2, h.move)) * 10000;
        const income = 10000 * (1 / (1 + h.move) - 1);
        return { ...h, position, income, net: position + income };
      }),
    [],
  );
  const lim = acc?.limits;

  return (
    <>
      <div className={m.card}>
        <h3 className={m.cardTitle}>A bet on Ergo's average difficulty</h3>
        <p className={s.lede}>
          Two people agree on a strike difficulty and a window of time. When the window ends, Ergo's average difficulty
          over the window decides the result of the bet. Everything is in
          LIT and on chain, and there is no pool and no price oracle. The difficulty comes straight from Ergo's block
          headers. All profits and losses come only from the two parties involved in the forwards contract.
        </p>
        <div className={s.steps}>
          {STEPS.map((st) => (
            <div key={st.n} className={s.step}>
              <span className={s.stepNum}>{st.n}</span>
              <div className={s.stepTitle}>{st.title}</div>
              <p className={s.stepText}>{st.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={s.kpis} style={{ marginTop: 16 }}>
        <Kpi label="Each 1% move" value="5" unit="% of margin" sub="moves from one side to the other" />
        <Kpi label="Limit" value="±20" unit="%" sub="the whole margin; a bigger move pays the same" />
        <Kpi
          label="Window"
          value={heights ? `128–${fmtInt(120 * 128)}` : '1–120'}
          unit={heights ? 'blocks' : 'epochs'}
          sub={`about ${fmtSpan(128)} to ${fmtSpan(120 * 128)}`}
        />
        <Kpi
          label="Fees per side"
          value={fmtLitFull(SIDE_REWARD)}
          unit="LIT"
          sub={`${fmtLitFull(SETTLE_REWARD / 2n)} to the settler, ${fmtLitFull(ACC_DEPOSIT / 2n)} to the difficulty record`}
        />
      </div>

      <div className={m.card} style={{ marginTop: 16 }}>
        <h3 className={m.cardTitle}>Words used here</h3>
        <dl className={s.terms}>
          {TERMS.map(([term, text]) => (
            <div key={term} className={s.term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Explorer base={base} />

      <div className={m.split} style={{ marginTop: 16 }}>
        <div className={m.card}>
          <h3 className={m.cardTitle}>Who it is for</h3>
          <p className={s.lede}>
            <b style={{ color: COLORS.next }}>Miners hedging income.</b> When network difficulty rises, mining rewards fall. Miners who wish to hedge
            against this risk can go long on difficulty, allowing them to soften their losses. 
            <br/><b style={{ color: COLORS.long }}>Miners looking to multiply profits.</b> When network difficulty drops, mining rewards grow. Miners with greater risk appetites 
            can go short on difficulty, potentially gaining more profits than normal from counterparties looking to hedge.
            <br/><b style={{ color: COLORS.difficulty }}>Traders.</b> Price and difficulty are often correlated, but traders and other market participants may find difficulty forwards preferable to bets
            on Ergo's price alone. 
          </p>
          <div className={s.table}>
            <div className={`${s.tr} ${s.hedgeTr} ${s.th}`}>
              <span>Window mean</span>
              <span className={m.num}>Position</span>
              <span className={m.num}>Mining income</span>
              <span className={m.num}>Net</span>
            </div>
            {hedge.map((h) => (
              <div key={h.label} className={`${s.tr} ${s.hedgeTr}`}>
                <span>{h.label} vs strike</span>
                <span className={m.num}>{h.position >= 0 ? '+' : ''}{fmtInt(Math.round(h.position))}</span>
                <span className={m.num}>{h.income >= 0 ? '+' : ''}{fmtInt(Math.round(h.income))}</span>
                <span className={m.num} style={{ color: h.net >= 0 ? COLORS.gain : COLORS.loss }}>
                  {h.net >= 0 ? '+' : ''}{fmtInt(Math.round(h.net))}
                </span>
              </div>
            ))}
          </div>
          <p className={m.cardNote} style={{ marginTop: 8 }}>
            To size a hedge, match the income over the window: 2,000 LIT of margin is a
            10,000 LIT notional, so each 1% move pays 100 LIT, about what a 1% change in difficulty does to 10,000 LIT of
            income.
          </p>
        </div>

        <div className={m.card}>
          <h3 className={m.cardTitle}>What to watch</h3>
          <ul className={s.risks}>
            <li>
              <b>Short windows can be pushed.</b> A miner with a tenth of Ergo's hashrate who mines elsewhere for one epoch
              lowers that epoch's difficulty by about 7.5%. This client caps windows under {lim?.shortWindowEpochs ?? 8}{' '}
              epochs at {lim ? fmtLit(marginOf(lim.shortWindowMaxNotional), 0) : '200'} LIT of margin.
            </li>
            <li>
              <b>Standing offers can be picked off.</b> Each difficulty change makes a window easier to forecast, and a taker
              fills only offers that have turned in their favour. New offers expire after one epoch unless you move them, and
              never after the last block that can fill them.
            </li>
            <li>
              <b>LIT is not hedged.</b> Margins and payouts are LIT, so the LIT price moves what a position is worth in ERG.
            </li>
            <li>
              <b>Settlement is automatic, but open to anyone.</b> Lithos clients record each epoch and settle finished
              positions. If nobody did for 128 epochs after a window began, each side would get its margin back instead.
              You can also settle a finished position yourself from Portfolio, and keep the settler's {litText(SETTLE_REWARD)}.
            </li>
            <li>
              <b>Offers fill whole.</b> There are no partial fills.
            </li>
          </ul>
          <p className={m.cardNote}>
            The full explanation is in the docs:{' '}
            <Link to="/docs/extensions/difficulty-forwards">Difficulty forwards</Link>.
          </p>
        </div>
      </div>
    </>
  );
}
