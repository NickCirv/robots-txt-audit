# Command reference

Use `node index.js` from the pinned source checkout described in the [README](../README.md). The entries below describe the inspected implementation.

| Command or argument | Behavior |
| --- | --- |
| `URL` | Fetch the site's robots.txt and report crawler directives. |
| `--ai` | Limit the presentation to AI-crawler checks; this is not an LLM mode. |

For prerequisites, file writes, external services and known limitations, see [Behavior and limits](../README.md#behavior-and-limits).

Implementation: [index.js](https://github.com/NickCirv/robots-txt-audit/blob/e9539ea8adb38922e73a8d460e93505e24dfdc86/index.js); [review evidence](RESEARCH.md).
