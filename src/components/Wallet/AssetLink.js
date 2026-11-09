import React from 'react';
import Link from '@docusaurus/Link';
import { assetLookupLink } from './assetLinks';
import s from './styles.module.css';

export default function AssetLink({ tokenId, check, children }) {
  const to = assetLookupLink(tokenId, check);
  return to ? <Link className={s.assetLink} to={to}>{children}</Link> : <>{children}</>;
}
