import React from 'react';
// Everything Docusaurus normally provides (code blocks, admonitions, headings…).
import MDXComponents from '@theme-original/MDXComponents';
import { Step, Requirements, Req, FeatureRow, Progress, HelpCard } from '@site/src/components/Guide';
import ApiCategoryPage from '@site/src/components/ApiCategoryPage';
import ClientStatus from '@site/src/components/ClientStatus';

/**
 * Global MDX scope.
 *
 * Registering the Currents content components here means a doc can use
 * <Step>, <Requirements> etc. directly, without an import line in every file.
 */
export default {
  ...MDXComponents,
  Step,
  Requirements,
  Req,
  FeatureRow,
  Progress,
  HelpCard,
  ApiCategoryPage,
  ClientStatus,
};
