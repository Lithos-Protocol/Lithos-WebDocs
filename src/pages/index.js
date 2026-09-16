import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import HeroFlowField from '@site/src/components/FlowField/Hero';
import styles from './index.module.css';

/* ---------- icons (inline SVG, 1.6px strokes) ---------- */
const IconCube = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinejoin="round" {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </svg>
);
const IconTerminal = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="3" />
    <path d="M6.5 9.5l3 2.5-3 2.5M12.5 15h5" />
  </svg>
);
const IconRocket = (p) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M12 3v18M12 3l6 6M12 3L6 9M5 19h14" />
  </svg>
);
const IconDoc = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" {...p}>
    <path d="M4 5h16v15H4z" />
    <path d="M8 9h8M8 13h8" />
  </svg>
);
const IconGear = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
  </svg>
);
const IconBlock = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinejoin="round" {...p}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
  </svg>
);
const IconLock = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" {...p}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 018 0v3" />
  </svg>
);
const IconCheck = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" {...p}>
    <path d="M4 12l5 5L20 6" />
  </svg>
);
const IconApi = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" {...p}>
    <rect x="2.5" y="4" width="19" height="16" rx="3" />
    <path d="M6.5 9.5l3 2.5-3 2.5" />
  </svg>
);
const IconGem = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinejoin="round" {...p}>
    <path d="M12 3l7 6-7 12L5 9z" />
  </svg>
);
const IconUp = (p) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" {...p}>
    <path d="M12 3v18M12 3l6 6M12 3L6 9" />
  </svg>
);

function Hero() {
  return (
    <section className={styles.hero}>
      <HeroFlowField />
      <div className={styles.heroInner}>
        <div className={`${styles.heroCopy} curScrimHost`}>
          <h1 className={styles.heroTitle}>
            Let The
            <br />
            Blocks <span className={`curFlowWord ${styles.flowWord}`}>Flow</span>
          </h1>
          <p className={styles.heroLead}>
            A decentralized mining pool protocol on Ergo. Miners build their own blocks.
            Smart contracts route every reward by proven work. 
          </p>
          <div className={styles.heroCtas}>
            <Link className={styles.ctaPrimary} to="/docs/intro">
              Read the docs
              <svg width="15" height="10" viewBox="0 0 14 10" fill="none" aria-hidden="true">
                <path d="M0 5h12M8 1l4 4-4 4" stroke="#060913" strokeWidth="1.8" />
              </svg>
            </Link>
            <Link className={styles.ctaGhost} to="/docs/category/lithos-api">
              Explore the API
            </Link>
          </div>
        </div>
        <div />
      </div>
    </section>
  );
}

const FEATURES = [
  {
    Icon: IconCube,
    accent: 'cyan',
    title: 'Mining protocol',
    body: 'LFSM states, non-interactive share proofs, collateral mechanics and more.',
    link: '/docs/intro',
    label: 'Read protocol docs →',
  },
  {
    Icon: IconTerminal,
    accent: 'purple',
    title: 'REST API reference',
    body: 'Every endpoint with full schemas and ready-made calls in Python, cURL, Node and JavaScript.',
    link: '/docs/category/lithos-api',
    label: 'View API endpoints →',
  },
  {
    Icon: IconRocket,
    accent: 'cyan',
    title: 'Startup guide',
    body: 'Spin up an Ergo testnet node and configure your Lithos client from scratch, step by step.',
    link: '/docs/startup-intro',
    label: 'Get started →',
  },
];

function Features() {
  return (
    <section className={styles.features}>
      <h2 className={styles.sectionTitle}>Everything in one stream</h2>
      <p className={styles.sectionSub}>From protocol spec to live API testing.</p>
      <div className={styles.featureGrid}>
        {FEATURES.map(({ Icon, accent, title, body, link, label }) => (
          <div
            key={title}
            className={`${styles.featureCard} ${accent === 'purple' ? styles.cardPurple : styles.cardCyan}`}
          >
            <div className={styles.cardGlow} aria-hidden="true" />
            <div className={styles.iconTile}>
              <Icon stroke={accent === 'purple' ? '#a855f7' : '#38bdf8'} />
            </div>
            <h3 className={styles.featureTitle}>{title}</h3>
            <p className={styles.featureBody}>{body}</p>
            <Link className={accent === 'purple' ? styles.featureLinkPurple : styles.featureLink} to={link}>
              {label}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

const QUICK = [
  { Icon: IconDoc, stroke: '#38bdf8', label: 'Introduction', to: '/docs/intro' },
  { Icon: IconGear, stroke: '#38bdf8', label: 'LFSM parameters', to: '/docs/tutorial-basics/lfsm' },
  { Icon: IconBlock, stroke: '#38bdf8', label: 'Mining on Lithos', to: '/docs/tutorial-basics/mining-on-lithos' },
  { Icon: IconLock, stroke: '#a855f7', label: 'NISPs', to: '/docs/tutorial-basics/NISPs' },
  { Icon: IconCheck, stroke: '#a855f7', label: 'Voting', to: '/docs/tutorial-basics/voting' },
  { Icon: IconApi, stroke: '#38bdf8', label: 'Lithos API', to: '/docs/category/lithos-api' },
  { Icon: IconGem, stroke: '#a855f7', label: 'LithosDex', to: '/dex' },
  { Icon: IconUp, stroke: '#38bdf8', label: 'Startup guide', to: '/docs/startup-intro' },
];

function QuickNav() {
  return (
    <section className={styles.quick}>
      <h2 className={styles.quickTitle}>Quick navigation</h2>
      <div className={styles.quickGrid}>
        {QUICK.map(({ Icon, stroke, label, to }) => (
          <Link key={label} className={styles.quickLink} to={to}>
            <Icon stroke={stroke} />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      title="Lithos Client — Docs &amp; REST API"
      description="Documentation and REST API reference for the Lithos Protocol mining client."
    >
      <div className={styles.page}>
        <Hero />
        <Features />
        <QuickNav />
      </div>
    </Layout>
  );
}
