import React from 'react';
import { Redirect, useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

/** Every LithosDex tab now takes the pool as `?pool=`; this keeps `/dex/pool?nft=` links working. */
export default function DexPoolRedirect() {
  const { search } = useLocation();
  const nft = (new URLSearchParams(search).get('nft') ?? '').trim().toLowerCase();
  const swap = useBaseUrl('/dex');
  return <Redirect to={/^[0-9a-f]{64}$/.test(nft) ? `${swap}?pool=${nft}` : swap} />;
}
