import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import f from '../Collateral/styles.module.css';
import w from '../Wallet/styles.module.css';
import { lookupNfts } from '../Wallet/api';
import { Alert, Spinner } from './ui';
import { ProvisionStats, RedeemedStats } from '../Wallet/ProvisionStats';

/**
 * Checks one token id as a provision NFT on any listed pool: what it owns now, or what it owned. The answer comes
 * from public chain state, so any token can be checked, not only this wallet's.
 */
export default function NftLookupCard() {
  const [id, setId] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState(null);
  const valid = /^[0-9a-fA-F]{64}$/.test(id.trim());

  const look = async () => {
    setBusy(true);
    setError(null);
    try {
      const { nfts } = await lookupNfts([id.trim().toLowerCase()]);
      setAnswer({ ...nfts[0], at: Date.now() });
    } catch (e) {
      setAnswer(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.card} style={{ marginTop: '1.25rem' }}>
      <h3 className={s.cardTitle}>Look up a provision NFT</h3>
      <div className={f.settingInputRow}>
        <input
          className={f.settingInput}
          type="text"
          value={id}
          placeholder="token id"
          spellCheck={false}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && !busy && look()}
          aria-label="Token id to look up"
        />
        <button type="button" className={s.btnGhost} disabled={!valid || busy} onClick={look}>
          {busy ? <Spinner /> : 'Look up'}
        </button>
      </div>
      {error && (
        <Alert kind="error" title="Could not look it up">
          {error}
        </Alert>
      )}
      {answer && (
        <div className={w.lookupStats}>
          {answer.provisionNft ? (
            <>
              <ProvisionStats c={answer} checkedAt={answer.at} />
              <Link to={`/dex/liquidity?pool=${answer.pool.poolNFT}`} className={w.lookupLink}>
                Open its pool&rsquo;s Liquidity tab
              </Link>
            </>
          ) : answer.redeemed ? (
            <RedeemedStats c={answer} />
          ) : (
            <span className={w.hoverRow}>
              <span>Provision</span>
              <span>none: this token owns no provision on a listed pool</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
