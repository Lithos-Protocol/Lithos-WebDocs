import React from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';

const STEPS = [
  {
    title: 'Agree the terms',
    text: 'A borrower posts an order with collateral, or a lender posts an offer with the loan. Each names the amount lent, the repayment, the block it is due by and the collateral.',
  },
  {
    title: 'Make the bond',
    text: 'The other side fills the order or takes the offer. The loan reaches the borrower, the collateral is locked in a bond, and the lender receives one bond asset.',
  },
  {
    title: 'Settle',
    text: 'Repaid before maturity, the collateral returns to the borrower. Otherwise it is liquidated to the lender, less the batching fee. The bond asset holder claims either.',
  },
];

/** Zero-coupon bonds in short. The docs page has the detail. */
export default function Guide() {
  return (
    <div className={`${m.card} ${s.guide}`}>
      <h3 className={m.cardTitle}>How zero-coupon bonds work</h3>
      <p>
        A zero-coupon bond is a loan repaid in one payment at the end. The difference between the repayment and the
        loan is the lender's return. There is no pool and no oracle: every bond is between two people, and its
        collateral is held on chain until it is settled.
      </p>
      <div className={s.guideGrid}>
        {STEPS.map((step, i) => (
          <div key={step.title} className={s.guideStep}>
            <span className={s.guideNum}>STEP {i + 1}</span>
            <b>{step.title}</b>
            <p style={{ margin: 0 }}>{step.text}</p>
          </div>
        ))}
      </div>
      <h3 className={m.cardTitle}>The bond asset</h3>
      <p>
        Whoever holds the bond asset is owed the bond, so it can be sent or sold like any token. Its name is set by
        whoever minted it and proves nothing. This panel and your wallet check each one against the chain and mark it
        ZC-Bond only when it is the asset its bond was created with.
      </p>
      <h3 className={m.cardTitle}>Liquidation</h3>
      <p>
        From maturity on, anyone may liquidate an unpaid bond and keep its batching fee. Lithos miners do this in
        their own blocks for every bond paying at least 0.05 ERG, so a lender rarely has to.
      </p>
      <p className={m.cardNote}>
        Every check, setting and failure case: <Link to="/docs/extensions/sigmafi-bonds">SigmaFi bonds</Link>.
      </p>
    </div>
  );
}
