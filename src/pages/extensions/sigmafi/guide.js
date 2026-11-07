import React from 'react';
import { Redirect } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function SigmaFiGuidePage() {
  return <Redirect to={useBaseUrl('/docs/extensions/sigmafi-bonds')} />;
}
