/* Swizzled from docusaurus-theme-openapi-docs (MIT, Palo Alto Networks).
 * Rewritten as JSX and extended with the Currents right rail.
 *
 * `docItemComponent` is globally "@theme/ApiItem", so EVERY doc renders through
 * this layout — not just generated API pages. Swizzling DocItem/Layout alone has
 * no effect here, which is why the rail lives in this file too. */
import React from 'react';
import clsx from 'clsx';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import { useWindowSize } from '@docusaurus/theme-common';
import ContentVisibility from '@theme/ContentVisibility';
import DocBreadcrumbs from '@theme/DocBreadcrumbs';
import DocItemContent from '@theme/DocItem/Content';
import DocItemFooter from '@theme/DocItem/Footer';
import DocItemPaginator from '@theme/DocItem/Paginator';
import DocItemTOCDesktop from '@theme/DocItem/TOC/Desktop';
import DocItemTOCMobile from '@theme/DocItem/TOC/Mobile';
import DocVersionBadge from '@theme/DocVersionBadge';
import DocVersionBanner from '@theme/DocVersionBanner';
import ClientStatus from '@site/src/components/ClientStatus';
import styles from './styles.module.css';

function useDocTOC() {
  const { frontMatter, toc } = useDoc();
  const windowSize = useWindowSize();
  const hidden = frontMatter.hide_table_of_contents;
  const canRender = !hidden && toc.length > 0;
  return {
    hidden,
    mobile: canRender ? <DocItemTOCMobile /> : undefined,
    desktop:
      canRender && (windowSize === 'desktop' || windowSize === 'ssr') ? (
        <DocItemTOCDesktop />
      ) : undefined,
  };
}

export default function DocItemLayout({ children }) {
  const docTOC = useDocTOC();
  const { metadata, frontMatter } = useDoc();
  const api = frontMatter.api;
  const schema = frontMatter.schema;

  // Generated endpoint/schema pages carry their own right-hand panel (request
  // samples, responses, "Try it"), so the status card would crowd them.
  const isGenerated = Boolean(api || schema);
  const footerCol = isGenerated ? 'col--7' : 'col--12';

  return (
    <div className="row">
      <div className={clsx('col', !docTOC.hidden && styles.docItemCol)}>
        <ContentVisibility metadata={metadata} />
        <DocVersionBanner />
        <div className={styles.docItemContainer}>
          <article>
            <DocBreadcrumbs />
            <DocVersionBadge />
            {docTOC.mobile}
            <DocItemContent>{children}</DocItemContent>
            <div className="row">
              <div className={clsx('col', footerCol)}>
                <DocItemFooter />
              </div>
            </div>
          </article>
          <div className="row">
            <div className={clsx('col', footerCol)}>
              <DocItemPaginator />
            </div>
          </div>
        </div>
      </div>

      {docTOC.desktop && (
        <div className="col col--3">
          {/* One sticky rail holds both. Docusaurus makes the TOC sticky on its
              own; the status card below it was in normal flow, so it scrolled up
              over the pinned TOC. The rail sticks instead and the TOC goes
              static inside it. */}
          <div className="docRail">
            {docTOC.desktop}
            {!isGenerated && <ClientStatus />}
          </div>
        </div>
      )}
    </div>
  );
}
