import React from 'react';
import DexLayout from '@site/src/components/Dex/DexLayout';
import NftLookupCard from '@site/src/components/Dex/NftLookupCard';

export default function DexSearchPage() {
  return <DexLayout title="NFT search" description="Look up any LithosDex provision NFT." pooled={false}><NftLookupCard /></DexLayout>;
}
