import { useEffect, useState } from 'react';
import { useHistory, useLocation } from '@docusaurus/router';

export const validTokenId = (id) => /^[0-9a-f]{64}$/i.test(id.trim());

/** URL-driven public lookups support deep links and browser Back, and discard obsolete responses. */
export default function useTokenLookup(read, revision) {
  const location = useLocation();
  const history = useHistory();
  const query = new URLSearchParams(location.search).get('tokenId') ?? '';
  const tokenId = query.trim().toLowerCase();
  const [id, setId] = useState(query);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setId(query), [query]);
  useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);
    setBusy(false);
    if (!validTokenId(tokenId)) return;
    setBusy(true);
    read(tokenId).then((answer) => {
      if (live) setResult({ tokenId, answer });
    }, (e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [tokenId, attempt, revision, read]);
  const matching = id.trim().toLowerCase() === tokenId;
  const look = () => {
    if (!validTokenId(id)) return;
    const value = id.trim().toLowerCase();
    if (value === tokenId) setAttempt((n) => n + 1);
    else history.push({ pathname: location.pathname, search: `?tokenId=${value}` });
  };
  return { id, setId, tokenId, valid: validTokenId(id), look, busy: matching && busy,
    answer: matching && result?.tokenId === tokenId ? result.answer : null,
    error: matching ? error ?? (query && !validTokenId(query) ? 'Enter a 64-character hexadecimal token ID.' : null) : null };
}
