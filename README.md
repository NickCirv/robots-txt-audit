![robots-txt-audit — Nicholas Ashkar editorial artwork](assets/nicholas-ashkar/banner.png)

# robots-txt-audit

Inspect a site’s robots.txt for common configuration signals and selected crawler rules.

Fetches `/robots.txt`, parses user-agent blocks and reports issues, sitemap presence and a heuristic score. `--ai` limits output to the built-in AI crawler view.


<a id="install"></a>

## Quickstart

Package runtime requirement: Node.js `>=20`. Git is needed to obtain this pinned source checkout.

```bash
git clone https://github.com/NickCirv/robots-txt-audit.git
cd robots-txt-audit
git checkout e9539ea8adb38922e73a8d460e93505e24dfdc86
node index.js https://example.com --ai
```

This source-derived example has not been executed in this review. This example fetches the public example domain’s robots.txt; actual content/status was not checked in this review.




<a id="what-it-checks"></a>

<a id="ai-crawlers-tracked"></a>

<a id="scoring"></a>

## Usage

```bash
node index.js https://your-domain.example
node index.js https://your-domain.example --ai
```

Use a domain you administer for operational checks. Failed retrievals produce errors; a missing robots.txt has a separate report path.

[Command reference](docs/REFERENCE.md) covers arguments, modes and output controls.


<a id="what-it-is-not"></a>

## Behavior and limits

The parser and block evaluation are simplified and do not reproduce every crawler’s matching behavior. A robots rule is advisory to compliant crawlers and does not enforce access control. The built-in crawler list may age, and the score does not establish SEO performance or AI visibility. There is no dedicated successful `--help` branch; provide a URL.

## Development

Declared package scripts:

| Script | Command |
| --- | --- |
| `start` | `node index.js` |
| `test` | `node --test` |

The smoke test syntax-checks the entrypoint; it does not exercise CLI behavior or integrations.

## Research

[Source review and claim ledger](docs/RESEARCH.md) records revision `e9539ea8adb3`, inspected files and verification gaps.

## License and attribution

Protected license and attribution files remain unchanged: [LICENSE](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/LICENSE).

[Artwork credits](assets/nicholas-ashkar/CREDITS.md) · [Nicholas Ashkar — consulting](https://nicholashkar.com/#oxblood-contact)
