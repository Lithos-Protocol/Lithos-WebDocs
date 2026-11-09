import React from 'react';
import { Spinner } from '../Dex/ui';
import s from './styles.module.css';

export default function AssetLookupForm({ lookup, label }) {
  return <form className={s.lookupForm} onSubmit={(e) => { e.preventDefault(); if (lookup.valid && !lookup.busy) lookup.look(); }}>
    <input className={s.lookupInput} aria-label={label} value={lookup.id} placeholder="64-character token ID" spellCheck={false} autoCapitalize="none" autoComplete="off" onChange={(e) => lookup.setId(e.target.value)} />
    <button className={s.lookupButton} type="submit" disabled={!lookup.valid || lookup.busy}>{lookup.busy ? <Spinner /> : 'Search'}</button>
  </form>;
}
