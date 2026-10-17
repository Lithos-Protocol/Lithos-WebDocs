import React from 'react';
import { Redirect } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

/** Extensions open on the first one, difficulty forwards. */
export default function ExtensionsIndex() {
  return <Redirect to={useBaseUrl('/extensions/forwards')} />;
}
