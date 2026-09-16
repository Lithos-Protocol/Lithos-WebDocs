# Contributing

Thanks for taking the time. Issues and pull requests are welcome.

## Before you start

- For anything beyond a small fix, open an issue first so the approach can be agreed before the work
  is done.
- Documentation corrections are as welcome as code.

## Working on it

Setup, running and building are covered in the [README](README.md).

A few things worth knowing:

- **Do not hand-edit `docs/lithosapi/`.** Those pages are generated from
  `examples/lithosapi.yaml`. Change the spec and regenerate; see the README.
- **The spec is owned upstream.** `examples/lithosapi.yaml` is a copy of the client's
  `conf/openapi.yaml`. Endpoint changes belong in the client first.
- **Amounts are decimal strings.** Every amount the API returns crosses the wire as a string,
  because the fee accumulators exceed the exact range of a JavaScript number. Parse them with the
  BigInt helpers in `src/components/Dex/format.js` and never through `Number`.
- **CSS module class names are hashed**, so a global selector will not match one. Keep `@keyframes`
  in the module that uses them.
- Match the surrounding style rather than introducing a new one. Comments should explain why
  something is the way it is, not restate the code.

## Pull requests

- Check `yarn build` passes.
- Check the pages you touched in a browser, including at phone width.
- Describe what you changed and why, and say what you tested.
