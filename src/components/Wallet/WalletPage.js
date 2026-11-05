import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import { Alert, Spinner, GearIcon, TxResult } from '../Dex/ui';
import { fmtErg, fmtErgAmount, fmtToken, fmtTokenAmount, fmtInt, shortId, big } from '../Dex/format';
import { pairLabel } from '../Dex/pools';
import { Pager, PageSize, usePaged } from '../Extensions/ui';
import SettingsPanel from './SettingsPanel';
import TokenIcon, { PairIcons, TrustBadge, tokenLabel } from './TokenIcon';
import { CopyButton, KeyGate, FilterChips } from './ui';
import { ProvisionStats, RedeemedStats } from './ProvisionStats';

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

/** Above this many distinct tokens, provision NFTs are checked only when asked. */
const AUTO_CHECK_MAX_TOKENS = 100;

/** How old a provision NFT's stats get before the next balance read checks it again. */
const RECHECK_MS = 5 * 60 * 1000;

/** A single, indivisible token off the verified list: the only kind that can be a provision NFT. */
const isNftCandidate = (t) => !t.verified && big(t.amount) === 1n && (t.decimals == null || t.decimals === 0);

/** Named the way LithosDex names a provision NFT. Anyone can mint a token with that name. */
const ldNamed = (t) => typeof t.name === 'string' && t.name.startsWith('LD-NFT');

/**
 * Provision NFT checks, cached by token id while the page is open. With `auto`, every candidate is checked once
 * and one that owns a provision is checked again at the first balance read after five minutes. Without it, only
 * what `check` is handed. A request carries at most 100 ids.
 */
function useNftChecks(candidates, auto) {
  const [checks, setChecks] = useState({});
  const [pending, setPending] = useState(() => new Set());
  const [error, setError] = useState(null);
  const [failed, setFailed] = useState([]);
  const checksRef = useRef(checks);
  checksRef.current = checks;
  const inFlight = useRef(new Set());

  const check = useCallback(async (ids) => {
    const todo = ids.filter((id) => !inFlight.current.has(id));
    if (!todo.length) return;
    todo.forEach((id) => inFlight.current.add(id));
    setPending(new Set(inFlight.current));
    setError(null);
    setFailed([]);
    let i = 0;
    try {
      for (; i < todo.length; i += api.NFT_LOOKUP_MAX) {
        const chunk = todo.slice(i, i + api.NFT_LOOKUP_MAX);
        const { nfts } = await api.lookupNfts(chunk);
        // The same single-unit tokens, asked as SigmaFi bond assets. A client that cannot answer leaves them unmarked.
        const bonds = {};
        for (let j = 0; j < chunk.length; j += api.BOND_LOOKUP_MAX) {
          try {
            for (const b of await api.lookupBonds(chunk.slice(j, j + api.BOND_LOOKUP_MAX))) bonds[b.tokenId] = b;
          } catch {
            break;
          }
        }
        const at = Date.now();
        setChecks((prev) => {
          const next = { ...prev };
          for (const n of nfts) next[n.tokenId] = { ...n, bond: bonds[n.tokenId], at };
          return next;
        });
      }
    } catch (e) {
      setError(e.message);
      setFailed(todo.slice(i));
    } finally {
      todo.forEach((id) => inFlight.current.delete(id));
      setPending(new Set(inFlight.current));
    }
  }, []);

  useEffect(() => {
    if (!auto) return;
    const now = Date.now();
    const due = candidates
      .filter((t) => {
        const c = checksRef.current[t.tokenId];
        return !c || (c.provisionNft && now - c.at > RECHECK_MS);
      })
      .map((t) => t.tokenId);
    if (due.length) check(due);
  }, [auto, candidates, check]);

  return { checks, pending, error, retry: () => check(failed), check };
}

/** A token's standing: the verified list first, then what a provision check found. */
function statusOf(t, check, pending) {
  if (t.verified) return 'verified';
  if (check?.provisionNft) return 'provision';
  if (check?.bond?.bondAsset && check.bond.verified) return 'bond';
  if (check?.bond && (check.bond.bondAsset || t.name === 'SigmaFi ZC-Bond')) return 'fakeBond';
  if (pending) return 'checking';
  if (check?.redeemed) return 'redeemed';
  if (check && ldNamed(t)) return 'fakeNft';
  return 'unverified';
}

/** A token's balance at its decimals, or in raw units when the node does not know them. */
function Balance({ t }) {
  if (t.decimals == null) {
    return (
      <span className={s.amount} title="Decimals unknown: raw units">
        {fmtInt(t.amount)} <span className={s.unit}>units</span>
      </span>
    );
  }
  return (
    <span className={s.amount} title={fmtToken(t.amount, t.decimals, t.decimals)}>
      {fmtTokenAmount(t.amount, t.decimals, 4)}
    </span>
  );
}

const PROVISION_TEXT = {
  checking: 'Checking',
  redeemed: 'Closed: this NFT owned a provision since redeemed',
  fakeNft: 'None: the name copies an LD-NFT',
  unverified: 'None',
};

/**
 * What the wallet read already says about a token, shown on hover or focus. Built from the row's own data and any
 * provision check already made, so it costs no request: a page of 300 tokens adds nothing to what the client is
 * asked.
 */
function TokenHover({ t, check, status, candidate }) {
  const c = check?.provisionNft ? check : null;
  return (
    <span className={s.hoverCard} role="tooltip">
      <span className={s.hoverTitle}>
        {c ? (
          <PairIcons x={c.pool.tokenX} y={c.pool.tokenY} size={18} />
        ) : (
          <TokenIcon tokenId={t.tokenId} label={t.ticker ?? t.name} size={20} />
        )}
        {t.ticker ?? t.name ?? 'Unnamed token'}
      </span>
      <span className={s.hoverRow}>
        <span>List</span>
        <span>{t.verified ? 'Verified' : c ? 'Not listed: checked as a provision NFT' : 'Not on the verified list'}</span>
      </span>
      {t.name && !c && (
        <span className={s.hoverRow}>
          <span>Name</span>
          <span>{t.verified ? t.name : `${t.name}, set by its minter`}</span>
        </span>
      )}
      {c ? (
        <ProvisionStats c={c} checkedAt={c.at} />
      ) : check?.bond?.bondAsset ? (
        <BondStats b={check.bond} />
      ) : check?.redeemed ? (
        <RedeemedStats c={check} />
      ) : (
        <>
          <span className={s.hoverRow}>
            <span>Balance</span>
            <span className={s.mono}>
              {t.decimals == null ? `${fmtInt(t.amount)} units` : fmtToken(t.amount, t.decimals, t.decimals)}
            </span>
          </span>
          <span className={s.hoverRow}>
            <span>Decimals</span>
            <span>{t.decimals ?? 'unknown: the node has no token index'}</span>
          </span>
          {candidate && (
            <span className={s.hoverRow}>
              <span>Provision</span>
              <span>{check || status === 'checking' ? PROVISION_TEXT[status] : 'Not checked'}</span>
            </span>
          )}
        </>
      )}
      <span className={s.hoverId}>{t.tokenId}</span>
    </span>
  );
}

/**
 * A SigmaFi bond asset's standing, read from the chain: the bond it claims while live, or what the vault holds
 * once it is repaid or liquidated. `b` is one answer of `POST /sigmafi/assets`.
 */
function BondStats({ b }) {
  const t = b.bond?.terms;
  const vaultErg = b.vault.reduce((n, v) => n + big(v.nanoErgs), 0n);
  return (
    <>
      <span className={s.hoverRow}>
        <span>Bond</span>
        <span>{b.verified ? 'SigmaFi zero-coupon, checked against its mint' : b.verification ?? 'Not verified'}</span>
      </span>
      {t && (
        <>
          <span className={s.hoverRow}>
            <span>Owed</span>
            <span className={s.mono}>
              {t.repayToken ? `${fmtInt(t.repayment)} units` : `${fmtErg(t.repayment)} ERG`}
            </span>
          </span>
          <span className={s.hoverRow}>
            <span>Repay by</span>
            <span>block {fmtInt(t.maturityHeight)}</span>
          </span>
          <span className={s.hoverRow}>
            <span>Collateral</span>
            <span className={s.mono}>
              {fmtErg(t.collateralNanoErgs)} ERG{t.collateralTokens.length ? ` + ${t.collateralTokens.length} token(s)` : ''}
            </span>
          </span>
        </>
      )}
      {b.vault.length > 0 && (
        <span className={s.hoverRow}>
          <span>Claimable</span>
          <span className={s.mono}>{fmtErg(vaultErg)} ERG in {fmtInt(b.vault.length)} vault box(es)</span>
        </span>
      )}
    </>
  );
}

function Kpi({ label, children, sub, icon }) {
  return (
    <div className={s.kpi}>
      <div className={m.label}>{label}</div>
      <div className={s.kpiValue}>
        {icon}
        {children}
      </div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  );
}

const FILTERS = {
  all: () => true,
  verified: (t) => t.verified,
  unverified: (t) => !t.verified,
  nft: isNftCandidate,
};

/**
 * The provision NFT controls: the automatic check, what is in flight or failed, and with the automatic check off,
 * selecting single-unit tokens and checking them in one request per 100.
 */
function NftBar({ auto, onAuto, nft, unchecked, selected, setSelected }) {
  const named = unchecked.filter(ldNamed);
  const checkSelected = () => {
    nft.check([...selected]);
    setSelected(new Set());
  };
  return (
    <div className={s.nftBar}>
      <label className={s.checkLabel}>
        <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} />
        Check provision NFTs automatically
      </label>
      {nft.pending.size > 0 ? (
        <span className={s.nftNote}>
          <Spinner /> Checking {fmtInt(nft.pending.size)} token{nft.pending.size === 1 ? '' : 's'}…
        </span>
      ) : nft.error ? (
        <span className={s.nftNote}>
          Check failed: {nft.error}
          <button className={s.ghostBtn} type="button" onClick={nft.retry}>
            Retry
          </button>
        </span>
      ) : (
        !auto &&
        unchecked.length > 0 && (
          <span className={s.nftNote}>
            {fmtInt(unchecked.length)} single-unit token{unchecked.length === 1 ? '' : 's'} not checked
          </span>
        )
      )}
      {!auto && unchecked.length > 0 && (
        <span className={s.nftActions}>
          {named.length > 0 && (
            <button
              className={s.ghostBtn}
              type="button"
              onClick={() => setSelected(new Set([...selected, ...named.map((t) => t.tokenId)]))}
            >
              Select LD-NFT names ({fmtInt(named.length)})
            </button>
          )}
          {selected.size > 0 && (
            <button className={s.ghostBtn} type="button" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          )}
          <button className={s.primaryBtn} type="button" onClick={checkSelected} disabled={selected.size === 0}>
            Check selected ({fmtInt(selected.size)})
          </button>
        </span>
      )}
    </div>
  );
}

function TokensCard({ tokens }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [autoChoice, setAutoChoice] = useState(null);
  const [selected, setSelected] = useState(() => new Set());

  const candidates = useMemo(() => tokens.filter(isNftCandidate), [tokens]);
  const auto = autoChoice ?? tokens.length <= AUTO_CHECK_MAX_TOKENS;
  const nft = useNftChecks(candidates, auto);
  const unchecked = candidates.filter((t) => !nft.checks[t.tokenId] && !nft.pending.has(t.tokenId));
  const selectable = auto ? null : new Set(unchecked.map((t) => t.tokenId));

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const verifiedCount = tokens.filter((t) => t.verified).length;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens
      .filter(FILTERS[filter] ?? FILTERS.all)
      .filter((t) => !q || [t.name, t.ticker, t.tokenId].some((v) => v && v.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          tokenLabel(a).localeCompare(tokenLabel(b), undefined, { sensitivity: 'base' }),
      );
  }, [tokens, query, filter]);
  const paged = usePaged(rows);

  return (
    <div className={`${m.card} ${s.tokensCard}`}>
      <div className={s.cardHead}>
        <h3 className={m.cardTitle}>Tokens</h3>
        <div className={s.toolbar}>
          <FilterChips
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All', count: tokens.length },
              { id: 'verified', label: 'Verified', count: verifiedCount },
              { id: 'unverified', label: 'Unverified', count: tokens.length - verifiedCount },
              ...(candidates.length ? [{ id: 'nft', label: 'NFTs', count: candidates.length }] : []),
            ]}
          />
          <input
            className={s.search}
            value={query}
            placeholder="Search name, ticker or id"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            aria-label="Search tokens"
          />
        </div>
      </div>

      {candidates.length > 0 && (
        <NftBar
          auto={auto}
          onAuto={setAutoChoice}
          nft={nft}
          unchecked={unchecked}
          selected={selected}
          setSelected={setSelected}
        />
      )}

      {tokens.length === 0 ? (
        <div className={s.empty}>This wallet holds no tokens.</div>
      ) : rows.length === 0 ? (
        <div className={s.empty}>No token matches.</div>
      ) : (
        <div className={s.table} role="table" aria-label="Tokens">
          <div className={`${s.tRow} ${s.tHead} ${s.tokenRow}`} role="row">
            <span role="columnheader">Token</span>
            <span role="columnheader">List</span>
            <span role="columnheader" className={s.right}>
              Balance
            </span>
            <span role="columnheader">Token id</span>
          </div>
          {paged.rows.map((t) => {
            const check = nft.checks[t.tokenId];
            const status = statusOf(t, check, nft.pending.has(t.tokenId));
            const pool = check?.provisionNft ? check.pool : null;
            const label = t.ticker ?? t.name ?? 'Unnamed token';
            return (
              <div key={t.tokenId} className={`${s.tRow} ${s.tokenRow}`} role="row">
                <span className={s.tokenCol}>
                  {selectable?.has(t.tokenId) && (
                    <input
                      type="checkbox"
                      className={s.rowCheck}
                      checked={selected.has(t.tokenId)}
                      onChange={() => toggle(t.tokenId)}
                      aria-label={`Select ${label} to check as a provision NFT`}
                    />
                  )}
                  <span className={`${s.tokenCell} ${s.hoverHost}`} tabIndex={0}>
                    <TokenHover t={t} check={check} status={status} candidate={isNftCandidate(t)} />
                    {pool ? (
                      <PairIcons x={pool.tokenX} y={pool.tokenY} size={20} />
                    ) : (
                      <TokenIcon tokenId={t.tokenId} label={t.ticker ?? t.name} size={26} />
                    )}
                    <span className={s.tokenText}>
                      <span className={t.verified || pool ? s.tokenName : s.tokenNameUnverified}>{label}</span>
                      {t.verified && t.name && t.name !== t.ticker && <span className={s.tokenSub}>{t.name}</span>}
                      {pool ? (
                        <Link className={s.tokenSubLink} to={`/dex/liquidity?pool=${pool.poolNFT}`}>
                          {pairLabel(pool)} provision
                        </Link>
                      ) : status === 'fakeNft' ? (
                        <span className={s.tokenSubWarn}>owns no provision</span>
                      ) : (
                        !t.verified &&
                        t.name && (
                          <span className={s.tokenSub} title="Chosen by whoever minted the token">
                            name set by its minter
                          </span>
                        )
                      )}
                    </span>
                  </span>
                </span>
                <span>
                  <TrustBadge status={status} />
                </span>
                <span className={s.right}>
                  <Balance t={t} />
                </span>
                <span className={s.idCell}>
                  <span className={s.mono} title={t.tokenId}>
                    {shortId(t.tokenId, 6, 6)}
                  </span>
                  <CopyButton text={t.tokenId} title="Copy token id" />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className={s.tableFoot}>
          <span className={m.label}>
            {fmtInt(paged.first + 1)}–{fmtInt(paged.first + paged.rows.length)} of {fmtInt(rows.length)}
          </span>
          <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />
          <span className={s.pageSize}>
            <PageSize value={paged.size} onChange={paged.setSize} />
          </span>
        </div>
      )}
    </div>
  );
}

function RewardsCard({ rewards, error, onClaimed }) {
  const [confirming, setConfirming] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState(null);
  const [claimError, setClaimError] = useState(null);

  const claim = async () => {
    setClaiming(true);
    setClaimError(null);
    setResult(null);
    try {
      setResult(await api.claimRewards());
      onClaimed();
    } catch (e) {
      setClaimError(e.message);
    } finally {
      setClaiming(false);
      setConfirming(false);
    }
  };

  const unlocked = rewards ? big(rewards.unlockedNanoErgs) : 0n;
  const locked = rewards ? rewards.boxes - rewards.unlockedBoxes : 0;

  return (
    <div className={m.card}>
      <div className={s.cardHead}>
        <h3 className={m.cardTitle}>Lending rewards</h3>
        {rewards && unlocked > 0n && !confirming && (
          <button className={s.primaryBtn} type="button" onClick={() => setConfirming(true)} disabled={claiming}>
            Claim
          </button>
        )}
      </div>
      {error ? (
        <Alert kind="error" title="Could not read rewards">
          {error}
        </Alert>
      ) : !rewards ? (
        <div className={s.empty}>
          <Spinner /> Reading…
        </div>
      ) : rewards.boxes === 0 ? (
        <div className={s.empty}>No coinbase rewards held.</div>
      ) : (
        <div className={s.pairs}>
          <div>
            <div className={m.label}>Claimable now</div>
            <div className={s.pairValue}>
              {fmtErg(rewards.unlockedNanoErgs)} <span className={s.unit}>ERG</span>
            </div>
            <div className={s.kpiSub}>
              {fmtInt(rewards.unlockedBoxes)} box{rewards.unlockedBoxes === 1 ? '' : 'es'}
            </div>
          </div>
          <div>
            <div className={m.label}>Still locked</div>
            <div className={s.pairValue}>
              {fmtErg(big(rewards.totalNanoErgs) - unlocked)} <span className={s.unit}>ERG</span>
            </div>
            <div className={s.kpiSub}>
              {locked > 0
                ? `${fmtInt(locked)} box${locked === 1 ? '' : 'es'}, next in ${fmtInt(rewards.blocksUntilFirstUnlock ?? 0)} blocks`
                : 'none'}
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className={s.confirm}>
          <span>
            Sweep {fmtErg(rewards.unlockedNanoErgs)} ERG in {fmtInt(rewards.unlockedBoxes)} reward box
            {rewards.unlockedBoxes === 1 ? '' : 'es'} to your primary address.
          </span>
          <span className={s.confirmBtns}>
            <button className={s.ghostBtn} type="button" onClick={() => setConfirming(false)}>
              Keep
            </button>
            <button className={s.primaryBtn} type="button" onClick={claim} disabled={claiming}>
              {claiming ? 'Claiming…' : 'Claim'}
            </button>
          </span>
        </div>
      )}
      {claimError && (
        <Alert kind="error" title="Claim failed">
          {claimError}
        </Alert>
      )}
      {result && (
        <TxResult
          title="Rewards claimed"
          outcome={result.claims?.some((c) => c.outcome === 'uncertain') ? 'uncertain' : 'accepted'}
          rows={[['Claimed', `${fmtErg(result.claimedNanoErgs)} ERG`]]}
        >
          {(result.claims ?? []).map((c) => (
            <div key={c.txId} className={s.claimLine}>
              <span className={s.mono}>{shortId(c.txId, 10, 8)}</span>
              <span>
                {fmtErg(c.nanoErgs)} ERG · {fmtInt(c.boxes)} box{c.boxes === 1 ? '' : 'es'} · {c.outcome}
              </span>
            </div>
          ))}
        </TxResult>
      )}
    </div>
  );
}

/** The wallet page: what this client's wallet holds, with verified tokens marked and icons where they ship. */
export default function WalletPage() {
  const [keyed, setKeyed] = useState(false);
  const [balances, setBalances] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [error, setError] = useState(null);
  const [rewardsError, setRewardsError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoSecs, setAutoSecs] = useState(0);

  const refresh = useCallback(() => {
    if (!api.hasApiKey()) return;
    setLoading(true);
    Promise.all([
      api.getBalances().then(
        (b) => {
          setBalances(b);
          setError(null);
        },
        (e) => setError(e),
      ),
      api.getRewards().then(
        (r) => {
          setRewards(r);
          setRewardsError(null);
        },
        (e) => setRewardsError(e.message),
      ),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setKeyed(api.hasApiKey());
    setAutoSecs(api.getAutoRefresh());
    refresh();
  }, [refresh]);

  useAutoRefresh(autoSecs, refresh);

  const unlock = (key) => {
    api.setApiKey(key);
    setKeyed(api.hasApiKey());
    refresh();
  };

  const onSaved = () => {
    setKeyed(api.hasApiKey());
    setAutoSecs(api.getAutoRefresh());
    refresh();
  };

  const tokens = balances?.tokens ?? [];
  const verifiedCount = tokens.filter((t) => t.verified).length;
  const refused = error?.status === 403;

  return (
    <Layout title="Wallet" description="What this Lithos client's wallet holds.">
      <div className={m.page}>
        <FlowField
          height={320}
          lines={BAND_LINES}
          cubes={[
            cubeBetween({ cx: 1080, size: 36, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 560, size: 22, lineA: 130, lineB: 169 }),
          ]}
        />
        <div className={m.pageGlow1} aria-hidden="true" />
        <div className={m.pageGlow2} aria-hidden="true" />

        <div className={m.shell}>
          <div className={m.header}>
            <div className="curScrimHost curScrimHostTight">
              <h1 className={m.title}>
                Lithos<span className="curFlowWord">Wallet</span>
              </h1>
              <p className={m.subtitle}>What this client's wallet holds. Verified tokens are marked; any other
                token's name was chosen by whoever minted it.</p>
            </div>
            <div className={m.headerSide}>
              <div className={m.headerRow}>
                {loading && <Spinner />}
                <button className={m.gearBtn} onClick={() => setShowSettings((v) => !v)} type="button">
                  <GearIcon />
                  {showSettings ? 'Close' : 'Settings'}
                </button>
              </div>
            </div>
          </div>

          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSaved} />}

          {!keyed ? (
            <KeyGate what="this wallet's balances and rewards" onUnlock={unlock} />
          ) : (
            <>
              {error && (
                <Alert kind="error" title={refused ? 'The client refused this API key' : 'Could not read the wallet'}>
                  {refused ? 'Check the key under Settings.' : error.message}
                </Alert>
              )}

              {balances && (
                <>
                  <div className={s.kpis}>
                    <Kpi label="Spendable" icon={<TokenIcon tokenId="ERG" size={22} />} sub="unreserved plain boxes">
                      {fmtErgAmount(balances.nanoErgs, 4)} <span className={s.unit}>ERG</span>
                    </Kpi>
                    <Kpi
                      label="Held for transactions"
                      sub={`${fmtInt(balances.reservedBoxes)} box${balances.reservedBoxes === 1 ? '' : 'es'} in flight or kept for your blocks`}
                    >
                      {fmtErgAmount(balances.reservedNanoErgs, 4)} <span className={s.unit}>ERG</span>
                    </Kpi>
                    <Kpi label="Tokens" sub={`${fmtInt(verifiedCount)} verified`}>
                      {fmtInt(tokens.length)}
                    </Kpi>
                    <Kpi
                      label="Claimable rewards"
                      sub={rewards ? `${fmtInt(rewards.unlockedBoxes)} of ${fmtInt(rewards.boxes)} boxes unlocked` : '—'}
                    >
                      {rewards ? fmtErgAmount(rewards.unlockedNanoErgs, 4) : '—'} <span className={s.unit}>ERG</span>
                    </Kpi>
                  </div>

                  <div className={s.row2}>
                    <div className={m.card}>
                      <div className={s.cardHead}>
                        <h3 className={m.cardTitle}>Primary address</h3>
                        <CopyButton text={balances.primaryAddress} title="Copy address" />
                      </div>
                      <div className={s.address}>{balances.primaryAddress}</div>
                      <p className={m.cardNote}>Change and swept rewards land here.</p>
                    </div>
                    <RewardsCard rewards={rewards} error={rewardsError} onClaimed={refresh} />
                  </div>

                  <TokensCard tokens={tokens} />
                </>
              )}

              {!balances && !error && (
                <div className={s.empty}>
                  <Spinner /> Reading the wallet…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
