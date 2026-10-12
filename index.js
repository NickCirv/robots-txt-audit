#!/usr/bin/env node
'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// One row per user-agent product token, so each token gets its own verdict.
const AI_CRAWLERS = [
  { token: 'GPTBot', org: 'OpenAI (training)' },
  { token: 'ChatGPT-User', org: 'OpenAI (user-triggered fetch)' },
  { token: 'ClaudeBot', org: 'Anthropic (training)' },
  { token: 'Claude-Web', org: 'Anthropic (legacy)' },
  { token: 'anthropic-ai', org: 'Anthropic (legacy)' },
  { token: 'PerplexityBot', org: 'Perplexity' },
  { token: 'Google-Extended', org: 'Google AI (Gemini training)' },
  { token: 'CCBot', org: 'Common Crawl' },
  { token: 'Bytespider', org: 'TikTok/ByteDance' },
  { token: 'Amazonbot', org: 'Amazon' },
  { token: 'FacebookBot', org: 'Meta' },
  { token: 'Applebot-Extended', org: 'Apple AI' },
  { token: 'YouBot', org: 'You.com' },
  { token: 'Omgili', org: 'Webz.io' },
  { token: 'DiffBot', org: 'DiffBot' },
];

function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'robots-txt-audit/1.1 (+https://github.com/NickCirv/robots-txt-audit)' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetch(next, redirects + 1));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function parseRobots(text) {
  const blocks = [];
  let current = null;
  const sitemaps = [];
  const crawlDelays = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        blocks.push(current);
      }
      current.agents.push(value);
    } else if (field === 'disallow' || field === 'allow') {
      if (current) {
        current.rules.push({ type: field, path: value });
      }
    } else if (field === 'sitemap') {
      sitemaps.push(value);
    } else if (field === 'crawl-delay') {
      if (current) crawlDelays.push({ agents: current.agents, delay: value });
    }
  }

  return { blocks, sitemaps, crawlDelays };
}

// --- RFC 9309 matching ------------------------------------------------------
// https://www.rfc-editor.org/rfc/rfc9309

// Canonicalize a path or rule pattern to a comparable octet string:
// UTF-8 encode, then decode percent-escapes to raw octets, except %2F
// (encoded slash), which stays encoded so /a%2Fb and /a/b compare differently.
function canonicalPath(s) {
  const octets = Buffer.from(s, 'utf8').toString('latin1');
  return octets.replace(/%([0-9a-fA-F]{2})/g, (m, hex) =>
    hex.toLowerCase() === '2f' ? '%2F' : String.fromCharCode(parseInt(hex, 16))
  );
}

// Does a rule pattern match the path? Supports '*' (any octet sequence)
// and a trailing '$' (end-of-path anchor). Patterns match from the start.
function patternMatches(pattern, path) {
  const anchored = pattern.endsWith('$');
  if (anchored) pattern = pattern.slice(0, -1);
  const parts = pattern.split('*');

  if (!path.startsWith(parts[0])) return false;
  let pos = parts[0].length;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (anchored && i === parts.length - 1) {
      // Final literal must sit at the end of the path, at or after pos.
      return path.endsWith(part) && path.length - part.length >= pos;
    }
    const idx = path.indexOf(part, pos);
    if (idx === -1) return false;
    pos = idx + part.length;
  }

  if (anchored) return path.length === pos; // no wildcard: exact match
  return true;
}

// RFC 9309 2.2.1: pick groups whose user-agent token matches exactly
// (case-insensitive); merge all matching groups. Fall back to '*' groups.
function groupsForAgent(agentToken, blocks) {
  const wanted = agentToken.toLowerCase();
  const specific = blocks.filter(b => b.agents.some(a => a.toLowerCase() === wanted));
  if (specific.length > 0) return specific;
  return blocks.filter(b => b.agents.includes('*'));
}

// RFC 9309 2.2.2: evaluate every rule in the merged group against the path;
// the match with the most octets wins; on a tie, Allow wins. An empty rule
// value is not a rule. No matching rule means crawling is allowed.
function isBlocked(agentToken, blocks, path = '/') {
  const groups = groupsForAgent(agentToken, blocks);
  if (groups.length === 0) {
    return { blocked: false, reason: 'no matching group (default allow)' };
  }

  const cpath = canonicalPath(path);
  let best = null;

  for (const group of groups) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      const cpattern = canonicalPath(rule.path);
      if (!patternMatches(cpattern, cpath)) continue;
      const len = cpattern.length;
      if (!best || len > best.len || (len === best.len && rule.type === 'allow' && best.type === 'disallow')) {
        best = { type: rule.type, pattern: rule.path, len };
      }
    }
  }

  if (!best) {
    return { blocked: false, reason: `no rule matches ${path} (default allow)` };
  }
  const label = best.type === 'disallow' ? 'Disallow' : 'Allow';
  return { blocked: best.type === 'disallow', reason: `${label}: ${best.pattern} (longest match)` };
}
// ---------------------------------------------------------------------------

function analyze(parsed, url) {
  const issues = [];
  const { blocks, sitemaps, crawlDelays } = parsed;

  // Check: no sitemap
  if (sitemaps.length === 0) {
    issues.push({ level: 'SUGGESTION', msg: 'No Sitemap directive found — helps crawlers discover your content.' });
  }

  // Check: crawl-delay (informational)
  if (crawlDelays.length > 0) {
    const agents = crawlDelays.map(d => `${d.agents.join(',')} (${d.delay}s)`).join(', ');
    issues.push({ level: 'INFO', msg: `Crawl-delay set for: ${agents} — only honored by some bots (Bing, Yandex).` });
  }

  // Deduplicate rules across blocks
  const seen = new Set();
  for (const block of blocks) {
    for (const rule of block.rules) {
      const key = `${block.agents.join('|')}:${rule.type}:${rule.path}`;
      if (seen.has(key)) {
        issues.push({ level: 'CLEANUP', msg: `Duplicate rule: ${rule.type}: ${rule.path} for [${block.agents.join(', ')}]` });
      }
      seen.add(key);
    }
  }

  for (const block of blocks) {
    const agentStr = block.agents.join(', ');
    const disallows = block.rules.filter(r => r.type === 'disallow');
    const allows = block.rules.filter(r => r.type === 'allow');

    // Disallow: / (blocking everything)
    if (disallows.some(r => r.path === '/')) {
      const hasAllowAll = allows.some(r => r.path === '/');
      if (!hasAllowAll) {
        issues.push({ level: 'CRITICAL', msg: `[${agentStr}] has Disallow: / — blocking the ENTIRE site for this agent.` });
      }
    }

    // No disallow = allowing everything
    if (disallows.length === 0 || disallows.every(r => !r.path)) {
      issues.push({ level: 'INFO', msg: `[${agentStr}] has no Disallow rules — fully open to crawling.` });
    }

    // Blocking CSS/JS
    for (const r of disallows) {
      if (r.path && (r.path.match(/\.(css|js)$/) || r.path.includes('/css') || r.path.includes('/js') || r.path.includes('static') || r.path.includes('assets'))) {
        issues.push({ level: 'WARNING', msg: `[${agentStr}] Disallow: ${r.path} — blocking static assets can break rendering and hurt SEO.` });
      }
    }

    // WP-specific: blocking /wp-admin but not admin-ajax
    const blocksWpAdmin = disallows.some(r => r.path === '/wp-admin/' || r.path === '/wp-admin');
    const allowsAjax = allows.some(r => r.path && r.path.includes('admin-ajax.php'));
    if (blocksWpAdmin && !allowsAjax) {
      issues.push({ level: 'WARNING', msg: `[${agentStr}] Disallow: /wp-admin without Allow: /wp-admin/admin-ajax.php — breaks WP AJAX for crawlers.` });
    }

    // Wildcard in path
    for (const r of disallows) {
      if (r.path && r.path.includes('*') && r.path !== '/*') {
        issues.push({ level: 'INFO', msg: `[${agentStr}] Wildcard pattern: Disallow: ${r.path} — ensure this is intentional.` });
      }
    }
  }

  return issues;
}

function scoreRobots(issues, hasSitemap) {
  let score = 100;
  for (const issue of issues) {
    if (issue.level === 'CRITICAL') score -= 30;
    else if (issue.level === 'WARNING') score -= 10;
    else if (issue.level === 'CLEANUP') score -= 5;
    else if (issue.level === 'SUGGESTION') score -= 5;
  }
  return Math.max(0, Math.min(100, score));
}

function levelColor(level) {
  switch (level) {
    case 'CRITICAL': return C.bgRed + C.white + C.bold;
    case 'WARNING': return C.yellow + C.bold;
    case 'SUGGESTION': return C.cyan;
    case 'CLEANUP': return C.magenta;
    case 'INFO': return C.blue;
    default: return C.reset;
  }
}

function scoreColor(score) {
  if (score >= 80) return C.green + C.bold;
  if (score >= 50) return C.yellow + C.bold;
  return C.red + C.bold;
}

function printBanner(url) {
  console.log('');
  console.log(C.bold + C.cyan + '  robots-txt-audit' + C.reset + C.dim + '  by NickCirv' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);
  console.log(C.dim + '  Auditing: ' + C.reset + C.white + url + C.reset);
  console.log('');
}

function printIssues(issues) {
  if (issues.length === 0) {
    console.log(C.green + '  No issues found.' + C.reset);
    return;
  }
  for (const issue of issues) {
    const badge = levelColor(issue.level) + ` ${issue.level} ` + C.reset;
    console.log(`  ${badge} ${issue.msg}`);
  }
}

function aiVerdicts(blocks, path = '/') {
  return AI_CRAWLERS.map((crawler) => {
    const result = isBlocked(crawler.token, blocks, path);
    return {
      token: crawler.token,
      org: crawler.org,
      verdict: result.blocked ? 'BLOCKED' : 'ALLOWED',
      reason: result.reason,
    };
  });
}

function printAISection(blocks, path = '/') {
  console.log('');
  console.log(C.bold + '  AI Crawler Visibility' + C.reset + C.dim + `  (path: ${path})` + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);

  for (const row of aiVerdicts(blocks, path)) {
    const blocked = row.verdict === 'BLOCKED';
    const icon = blocked ? C.red + 'BLOCKED' + C.reset : C.green + 'ALLOWED' + C.reset;
    const symbol = blocked ? C.red + '✗' + C.reset : C.green + '✓' + C.reset;
    const nameStr = C.white + row.token.padEnd(20) + C.reset;
    const orgStr = C.dim + `(${row.org})` + C.reset;
    console.log(`  ${symbol} ${nameStr} ${orgStr.padEnd(42)} ${icon}  ${C.dim}${row.reason}${C.reset}`);
  }
  console.log('');
}

function printScore(score) {
  const bar = Array(10).fill('░').map((_, i) => i < Math.round(score / 10) ? '█' : '░').join('');
  console.log('');
  console.log(C.bold + '  Quality Score' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);
  console.log(`  ${scoreColor(score)}${score}/100${C.reset}  ${C.dim}${bar}${C.reset}`);
  if (score === 100) console.log(C.green + C.dim + '  Perfect robots.txt!' + C.reset);
  else if (score >= 80) console.log(C.green + C.dim + '  Good — minor improvements possible.' + C.reset);
  else if (score >= 50) console.log(C.yellow + C.dim + '  Needs attention — review warnings above.' + C.reset);
  else console.log(C.red + C.dim + '  Critical issues found — immediate action needed.' + C.reset);
  console.log('');
}

function printSitemaps(sitemaps) {
  if (sitemaps.length === 0) return;
  console.log(C.bold + '  Sitemaps' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);
  for (const s of sitemaps) console.log(C.dim + '  →' + C.reset + ' ' + s);
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const aiOnly = args.includes('--ai');
  const asJson = args.includes('--json');
  const pathIdx = args.indexOf('--path');
  const checkPath = pathIdx !== -1 && args[pathIdx + 1] ? args[pathIdx + 1] : '/';
  const urlArg = args.find((a, i) => !a.startsWith('-') && (pathIdx === -1 || i !== pathIdx + 1));

  if (!urlArg) {
    console.error(C.red + 'Usage: robots-txt-audit <url> [--ai] [--json] [--path <path>]' + C.reset);
    console.error(C.dim + 'Example: robots-txt-audit https://example.com --ai' + C.reset);
    process.exit(1);
  }

  let base;
  try {
    base = new URL(urlArg.startsWith('http') ? urlArg : 'https://' + urlArg);
  } catch {
    console.error(C.red + 'Invalid URL: ' + urlArg + C.reset);
    process.exit(1);
  }

  const robotsUrl = `${base.protocol}//${base.host}/robots.txt`;
  if (!asJson) printBanner(robotsUrl);

  let res;
  try {
    res = await fetch(robotsUrl);
  } catch (err) {
    if (asJson) {
      console.log(JSON.stringify({ url: robotsUrl, error: err.message }));
    } else {
      console.error(C.red + '  Error fetching robots.txt: ' + err.message + C.reset);
    }
    process.exit(1);
  }

  if (res.status === 404) {
    if (asJson) {
      console.log(JSON.stringify({ url: robotsUrl, status: 404, note: 'robots.txt not found; crawlers assume full access' }, null, 2));
      process.exit(0);
    }
    console.log(C.yellow + C.bold + '  WARNING' + C.reset + ' robots.txt not found (404) — search engines assume full access.');
    printScore(60);
    process.exit(0);
  }

  if (res.status !== 200) {
    if (asJson) {
      console.log(JSON.stringify({ url: robotsUrl, status: res.status, error: 'could not retrieve robots.txt' }));
    } else {
      console.log(C.red + `  HTTP ${res.status} — could not retrieve robots.txt.` + C.reset);
    }
    process.exit(1);
  }

  const parsed = parseRobots(res.body);
  const issues = analyze(parsed, robotsUrl);
  const score = scoreRobots(issues, parsed.sitemaps.length > 0);
  const verdicts = aiVerdicts(parsed.blocks, checkPath);

  if (asJson) {
    const payload = aiOnly
      ? { url: robotsUrl, status: res.status, path: checkPath, aiCrawlers: verdicts }
      : { url: robotsUrl, status: res.status, path: checkPath, score, issues, sitemaps: parsed.sitemaps, aiCrawlers: verdicts };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  if (aiOnly) {
    printAISection(parsed.blocks, checkPath);
    process.exit(0);
  }

  // Full report
  console.log(C.bold + '  Issues' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);
  printIssues(issues);

  printAISection(parsed.blocks, checkPath);
  printSitemaps(parsed.sitemaps);
  printScore(score);

  console.log(C.dim + '  github.com/NickCirv' + C.reset);
  console.log('');
}

module.exports = {
  parseRobots,
  canonicalPath,
  patternMatches,
  groupsForAgent,
  isBlocked,
  aiVerdicts,
  AI_CRAWLERS,
};

if (require.main === module) {
  main().catch(err => {
    console.error(C.red + 'Fatal: ' + err.message + C.reset);
    process.exit(1);
  });
}
