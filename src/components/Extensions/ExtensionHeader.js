import React from 'react';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';

export default function ExtensionHeader({ name, description, docs, children }) {
  return (
    <header className={s.extensionHeader}>
      <div>
        <div className={s.eyebrow}>Lithos / Extensions</div>
        <h1 className={s.extensionTitle}>{name}</h1>
        <p className={s.extensionDescription}>{description}</p>
      </div>
      <div className={s.headerActions}>
        <Link className={s.docsLink} to={docs}>Documentation <span aria-hidden="true">↗</span></Link>
        {children}
      </div>
    </header>
  );
}

export function ExtensionNav({ items, label }) {
  const { pathname } = useLocation();
  const base = useBaseUrl('/').replace(/\/$/, '');
  const current = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname).replace(/\/+$/, '');
  return (
    <nav className={s.extensionNav} aria-label={label}>
      {items.map(({ to, label: text, exact }) => {
        const active = exact ? current === to : current.startsWith(to);
        return <Link key={to} to={to} className={`${s.navLink} ${active ? s.navActive : ''}`} aria-current={active ? 'page' : undefined}>{text}</Link>;
      })}
    </nav>
  );
}
