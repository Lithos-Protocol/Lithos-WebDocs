import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AssetIcon, assetName, TokenAmount, useTokens } from './tokens';
import s from './styles.module.css';
import { big } from './format';
import { isNftAsset } from './bond';
import { tokenPriority } from './pricing';

export default function AssetPicker({ tokens, value, onChange, label, balances = false, allowCustom = false, excludeNfts = false }) {
  const { metadata, check, checks } = useTokens();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const host = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!host.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => {
    check(tokens.filter((t) => !t.verified && big(t.amount) === 1n).map((t) => t.tokenId));
  }, [tokens, check]);
  const options = useMemo(() => {
    const q = query.toLowerCase().trim();
    return tokens.filter((t) => !excludeNfts || !isNftAsset(t, checks[t.tokenId]))
      .filter((t) => !q || [t.tokenId, t.ticker, t.name, assetName(metadata, t.tokenId, checks)].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => tokenPriority(a) - tokenPriority(b) || Number(b.verified) - Number(a.verified) || assetName(metadata, a.tokenId, checks).localeCompare(assetName(metadata, b.tokenId, checks)));
  }, [tokens, metadata, query, excludeNfts, checks]);
  const customId = query.trim().toLowerCase();
  const customIsNft = excludeNfts && isNftAsset(metadata[customId], checks[customId]);
  const custom = allowCustom && /^[a-f0-9]{64}$/.test(customId) && !customIsNft && !tokens.some((t) => t.tokenId === customId);
  useEffect(() => {
    if (excludeNfts) check([customId, value].filter((id) => /^[a-f0-9]{64}$/.test(id)));
  }, [excludeNfts, customId, value, check, checks]);
  return <div className={s.picker} ref={host} onKeyDown={(e) => {
    if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    if (['ArrowDown', 'ArrowUp'].includes(e.key) && open) {
      e.preventDefault();
      const choices = [...host.current.querySelectorAll('[role="option"]')];
      const at = choices.indexOf(document.activeElement);
      choices[(at + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className={s.pickerTrigger} aria-label={label} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((v) => !v)}>
      {value ? <><AssetIcon tokenId={value} /><span>{assetName(metadata, value, checks)}</span></> : <span>Select token</span>}
      <span className={s.caret} aria-hidden="true">⌄</span>
    </button>
    {open && <div className={s.pickerMenu}>
      <input autoFocus className={s.search} placeholder="Search name or token ID" aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className={s.pickerList} role="listbox" aria-label={label}>
        {options.map((t) => <button type="button" role="option" aria-selected={t.tokenId === value} className={s.pickerOption} key={t.tokenId} onClick={() => { onChange(t.tokenId); setOpen(false); setQuery(''); trigger.current?.focus(); }}>
          {balances ? <TokenAmount tokenId={t.tokenId} amount={t.amount} link={false} /> : <><AssetIcon tokenId={t.tokenId} /><span>{assetName(metadata, t.tokenId, checks)}</span></>}
          <span className={s.sub}>{t.tokenId === 'ERG' ? 'Ergo' : `${t.tokenId.slice(0, 6)}…${t.tokenId.slice(-4)}`}</span>
        </button>)}
        {options.length === 0 && <p className={s.hint}>No matching tokens.</p>}
        {customIsNft && <p className={s.hint}>NFTs are available as collateral, not as loan assets.</p>}
        {custom && <button type="button" role="option" aria-selected={value === customId} className={s.pickerOption} onClick={() => { onChange(customId); setOpen(false); setQuery(''); trigger.current?.focus(); }}>Use token {customId.slice(0, 8)}…{customId.slice(-6)}</button>}
      </div>
      {allowCustom && <p className={s.hint}>For an unlisted loan asset, paste its token ID. Unknown decimals use raw units.</p>}
    </div>}
  </div>;
}
