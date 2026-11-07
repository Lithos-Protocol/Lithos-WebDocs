export const BOND_ASSET_NAME = 'SigmaFi Bond';
export const PROVISION_ASSET_NAME = 'LithosDex Provision';

/** Display aliases only: names never establish whether an asset is genuine. */
export function protocolAssetName(token, check) {
  const nft = check?.nft ?? check;
  if (nft?.provisionNft || nft?.redeemed) return PROVISION_ASSET_NAME;
  if (check?.bond?.bondAsset && check.bond.verified) return BOND_ASSET_NAME;
  if (token?.verified) return null;
  if (/^LD-NFT(?:-[a-f0-9]{6})?$/i.test(token?.name ?? '')) return PROVISION_ASSET_NAME;
  if (/^SigmaFi[- ]ZC[- ]Bond(?:-[a-f0-9]{6})?$/i.test(token?.name ?? '')) return BOND_ASSET_NAME;
  return null;
}

export function tokenDisplayName(token, check) {
  if (!token) return '—';
  if (token.tokenId === 'ERG') return 'ERG';
  return protocolAssetName(token, check) ?? token.ticker ?? token.name ?? `${token.tokenId.slice(0, 6)}…`;
}
