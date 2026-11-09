import React from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import w from '../Wallet/styles.module.css';
import { lookupNfts } from '../Wallet/api';
import { Alert, Spinner } from './ui';
import { ProvisionStats, RedeemedStats } from '../Wallet/ProvisionStats';
import useTokenLookup from '../Wallet/useTokenLookup';
import AssetLookupForm from '../Wallet/AssetLookupForm';
import { CopyButton } from '../Wallet/ui';
import { useDex } from './DexLayout';

const readNft = async (id) => {
  const { nfts } = await lookupNfts([id]);
  const answer = nfts.find((n) => n.tokenId === id);
  if (!answer) throw new Error('The client returned no lookup result. Try again.');
  return { ...answer, at: Date.now() };
};

/**
 * Checks one token id as a provision NFT on any listed pool: what it owns now, or what it owned. The answer comes
 * from public chain state, so any token can be checked, not only this wallet's.
 */
export default function NftLookupCard() {
  const { tick } = useDex();
  const lookup = useTokenLookup(readNft, tick);
  const { answer, error } = lookup;

  return (
    <div className={s.card} style={{ marginTop: '1.25rem' }}>
      <h3 className={s.cardTitle}>Look up a provision NFT</h3>
      <p className={s.cardDesc}>Search any LD-NFT to inspect its liquidity, fees and pool. No API key is needed.</p>
      <AssetLookupForm lookup={lookup} label="Provision NFT token ID" />
      {lookup.busy && <p className={s.cardDesc}><Spinner /> Reading provision</p>}
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
            <><RedeemedStats c={answer} /><Link to={`/dex/liquidity?pool=${answer.pool.poolNFT}`} className={w.lookupLink}>Open its pool&rsquo;s Liquidity tab</Link></>
          ) : (
            <span className={w.hoverRow}>
              <span>Provision</span>
              <span>none: this token owns no provision on a listed pool</span>
            </span>
          )}
          <div className={w.lookupId}><span>{lookup.tokenId}</span><CopyButton text={lookup.tokenId} title="Copy provision token ID" /></div>
        </div>
      )}
    </div>
  );
}
