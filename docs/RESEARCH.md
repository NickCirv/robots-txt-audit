# Source review — robots-txt-audit

## Revision and method

Inspected public commit: [`e9539ea8adb38922e73a8d460e93505e24dfdc86`](https://github.com/NickCirv/robots-txt-audit/commit/e9539ea8adb38922e73a8d460e93505e24dfdc86). Source tree: `aac485aa9538c6b3a922ff5f3d326144c30caee3`. Capture scope: all eligible text files; 6 of 6 eligible files.

This review read captured implementation and documentation. It did not install dependencies, execute project commands, call project APIs, check package publication or establish live CI status. Examples are source-derived, not captured execution transcripts.

## Claim ledger

| Claim | Evidence | Status |
| --- | --- | --- |
| Fetch, robots parsing, crawler matching and CLI routing | [index.js](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/index.js) | Verified in inspected source; execution unverified |

## Findings and verification gaps

The parser and block evaluation are simplified and do not reproduce every crawler’s matching behavior. A robots rule is advisory to compliant crawlers and does not enforce access control. The built-in crawler list may age, and the score does not establish SEO performance or AI visibility. There is no dedicated successful `--help` branch; provide a URL.

The captured smoke test only asks Node to syntax-check the entrypoint. It does not exercise behavior, integrations or failure paths. Neither that test nor installation was run in this review.

| Dimension | Result |
| --- | --- |
| Purpose and documented commands | Partially verified: static source inspection |
| Clean installation and examples | Unverified |
| Test suite and live CI | Unverified |
| Performance and security guarantees | Unverified |
| Publication | Local documentation only |

## Documentation inventory

- [README.md](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/README.md) — Rewritten; historic section anchors retained where practical.
- [LICENSE](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/LICENSE) — protected document preserved unchanged.

## Captured source inventory

- [LICENSE](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/LICENSE) — Git blob `481c289c06c96c07330f8c7dedd847c5c07ca384`.
- [README.md](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/README.md) — Git blob `4c274776f875d7ab1d6d854ef1c20ed9c02e8f82`.
- [package.json](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/package.json) — Git blob `b55e6e51ac639073ce2e237eb8f18588d8fc8ca8`.
- [.github/workflows/ci.yml](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/.github/workflows/ci.yml) — Git blob `44515034a394670de44454a7a1bd2c7ef0c9836e`.
- [index.js](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/index.js) — Git blob `5cd840ced5b8a573225e90807579bb577e8f04fb`.
- [test/smoke.test.js](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/test/smoke.test.js) — Git blob `7a4e5a61f35e2ff58cf15c833079191ac572315c`.

## Scope boundary

Capture excludes lockfiles, binary artwork, generated output, vendored dependencies and files above the acquisition size limit. The tree records their existence; no verification claim is made for omitted content. Protected documents and historical records are not replaced.

## Reference coverage

Added [command reference](REFERENCE.md) from the argument parser, command handlers and source-defined help at the pinned revision. README examples remain unexecuted.
