/** Lookup destinations use chain classifications, never a token's display name. */
export const bondLookupLink = (id) => `/extensions/sigmafi/search?tokenId=${encodeURIComponent(id)}`;
export const nftLookupLink = (id) => `/dex/search?tokenId=${encodeURIComponent(id)}`;

export function assetLookupLink(tokenId, check) {
  if (!/^[0-9a-f]{64}$/i.test(tokenId ?? '')) return null;
  if (check?.bond?.bondAsset) return bondLookupLink(tokenId.toLowerCase());
  const nft = check?.nft ?? check;
  return nft?.provisionNft || nft?.redeemed ? nftLookupLink(tokenId.toLowerCase()) : null;
}
