# Command reference

Use `node index.js` from the source checkout described in the [README](../README.md). The entries below describe the current implementation.

| Command or argument | Behavior |
| --- | --- |
| `URL` | Fetch the site's robots.txt and report crawler directives. |
| `--ai` | Limit the presentation to AI-crawler checks; this is not an LLM mode. |
| `--json` | Emit the report as JSON (url, status, path, score, issues, sitemaps, per-crawler verdicts; with `--ai`, verdicts only). |
| `--path <p>` | Evaluate crawler access for the given path instead of the default `/`. |

For prerequisites, file writes, external services and known limitations, see [Behavior and limits](../README.md#behavior-and-limits).

Implementation: [index.js](https://github.com/NickCirv/robots-txt-audit/blob/main/index.js); [review evidence](RESEARCH.md).
