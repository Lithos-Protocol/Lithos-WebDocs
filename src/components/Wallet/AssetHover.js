import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './styles.module.css';

/** Position on opening only; portaling keeps details clear of cards and scrolling token menus. */
export default function AssetHover({ children, details, className = '', enabled = true }) {
  const host = useRef(null);
  const panel = useRef(null);
  const timer = useRef(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const show = () => { clearTimeout(timer.current); if (enabled) setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 100); };

  useLayoutEffect(() => {
    if (!open || !host.current || !panel.current) return;
    const anchor = host.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12));
    const below = Math.max(0, window.innerHeight - anchor.bottom - 20);
    const above = Math.max(0, anchor.top - 20);
    const down = below >= box.height || below >= above;
    const height = Math.min(box.height, down ? below : above);
    const top = down ? anchor.bottom + 8 : anchor.top - height - 8;
    // A tall card scrolls on its roomier side instead of covering the asset's links.
    setPosition({ left, top, '--asset-hover-height': `${height}px` });
  }, [open, details]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!panel.current?.contains(e.target) && !host.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('pointerdown', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('pointerdown', close); };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return <span ref={host} className={className} tabIndex={enabled ? 0 : undefined} aria-describedby={open ? id : undefined}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show}
    onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget) && !panel.current?.contains(e.relatedTarget)) hide(); }}
    onKeyDown={(e) => { if (e.key === 'Escape' && open) { setOpen(false); e.stopPropagation(); } }}>
    {children}
    {open && createPortal(<span ref={panel} className={s.floatingAsset} style={position} onMouseEnter={show} onMouseLeave={hide}>
      {React.cloneElement(details, { tooltipId: id })}
    </span>, document.body)}
  </span>;
}
