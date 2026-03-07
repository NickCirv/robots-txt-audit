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

const AI_CRAWLERS = [
  { name: 'GPTBot', org: 'OpenAI', agents: ['GPTBot'] },
  { name: 'Google-Extended', org: 'Google AI', agents: ['Google-Extended'] },
  { name: 'ClaudeBot', org: 'Anthropic', agents: ['ClaudeBot', 'anthropic-ai'] },
  { name: 'CCBot', org: 'Common Crawl', agents: ['CCBot'] },
  { name: 'Bytespider', org: 'TikTok/ByteDance', agents: ['Bytespider'] },
  { name: 'FacebookBot', org: 'Meta', agents: ['FacebookBot'] },
  { name: 'PerplexityBot', org: 'Perplexity', agents: ['PerplexityBot'] },
  { name: 'YouBot', org: 'You.com', agents: ['YouBot'] },
  { name: 'Applebot-Extended', org: 'Apple AI', agents: ['Applebot-Extended'] },
  { name: 'Omgili', org: 'Webz.io', agents: ['Omgili', 'omgilibot'] },
  { name: 'DiffBot', org: 'DiffBot', agents: ['DiffBot'] },
  { name: 'Amazonbot', org: 'Amazon Alexa', agents: ['Amazonbot'] },
];

function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
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
      if (current && current.agents.length && !blocks.includes(current)) {
        // If same block continues (no rules yet), just add agent
      }
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

function agentMatchesPattern(agent, pattern) {
  return pattern === '*' || agent.toLowerCase() === pattern.toLowerCase();
}

function isBlocked(agentName, blocks) {
  // Find most specific matching block (exact match > wildcard)
  let wildcardBlock = null;
  let specificBlock = null;

  for (const block of blocks) {
    for (const agent of block.agents) {
      if (agent === '*') wildcardBlock = block;
      else if (agent.toLowerCase() === agentName.toLowerCase()) specificBlock = block;
      else {
        // partial match
        for (const alias of [agentName]) {
          if (agent.toLowerCase() === alias.toLowerCase()) specificBlock = block;
        }
      }
    }
  }

  const block = specificBlock || wildcardBlock;
  if (!block) return { blocked: false, reason: 'no match (allowed)' };

  const hasDisallowAll = block.rules.some(r => r.type === 'disallow' && r.path === '/');
  const hasAnyDisallow = block.rules.some(r => r.type === 'disallow' && r.path);
  const hasAllowAll = block.rules.some(r => r.type === 'allow' && r.path === '/');

  if (hasDisallowAll && !hasAllowAll) return { blocked: true, reason: 'Disallow: /' };
  if (!hasAnyDisallow) return { blocked: false, reason: 'no Disallow rules' };
  return { blocked: false, reason: 'partial rules' };
}

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

function printAISection(blocks) {
  console.log('');
  console.log(C.bold + '  AI Crawler Visibility' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);

  for (const crawler of AI_CRAWLERS) {
    let blocked = false;
    let matchedAgent = '*';

    // Check each alias
    for (const alias of crawler.agents) {
      const result = isBlocked(alias, blocks);
      if (result.blocked) { blocked = true; matchedAgent = alias; break; }
    }
    // Also check wildcard
    const wildcard = isBlocked('*', blocks);

    // Determine via specific block or wildcard
    let specificMatch = false;
    for (const block of blocks) {
      for (const agent of block.agents) {
        for (const alias of crawler.agents) {
          if (agent.toLowerCase() === alias.toLowerCase()) {
            specificMatch = true;
            const hasDisallowAll = block.rules.some(r => r.type === 'disallow' && r.path === '/');
            const hasAnyDisallow = block.rules.some(r => r.type === 'disallow' && r.path);
            const hasAllowAll = block.rules.some(r => r.type === 'allow' && r.path === '/');
            if (hasDisallowAll && !hasAllowAll) blocked = true;
            else if (hasAnyDisallow) blocked = false; // partial rules
            else blocked = false;
          }
        }
      }
    }

    if (!specificMatch) {
      // Fall back to wildcard
      blocked = wildcard.blocked;
    }

    const icon = blocked ? C.red + 'BLOCKED' + C.reset : C.green + 'ALLOWED' + C.reset;
    const symbol = blocked ? C.red + '✗' + C.reset : C.green + '✓' + C.reset;
    const nameStr = C.white + crawler.name.padEnd(20) + C.reset;
    const orgStr = C.dim + `(${crawler.org})` + C.reset;
    console.log(`  ${symbol} ${nameStr} ${orgStr.padEnd(30)} ${icon}`);
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
  const urlArg = args.find(a => !a.startsWith('-'));

  if (!urlArg) {
    console.error(C.red + 'Usage: robots-txt-audit <url> [--ai]' + C.reset);
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
  printBanner(robotsUrl);

  let res;
  try {
    res = await fetch(robotsUrl);
  } catch (err) {
    console.error(C.red + '  Error fetching robots.txt: ' + err.message + C.reset);
    process.exit(1);
  }

  if (res.status === 404) {
    console.log(C.yellow + C.bold + '  WARNING' + C.reset + ' robots.txt not found (404) — search engines assume full access.');
    printScore(60);
    process.exit(0);
  }

  if (res.status !== 200) {
    console.log(C.red + `  HTTP ${res.status} — could not retrieve robots.txt.` + C.reset);
    process.exit(1);
  }

  const parsed = parseRobots(res.body);
  const issues = analyze(parsed, robotsUrl);
  const score = scoreRobots(issues, parsed.sitemaps.length > 0);

  if (aiOnly) {
    printAISection(parsed.blocks);
    process.exit(0);
  }

  // Full report
  console.log(C.bold + '  Issues' + C.reset);
  console.log(C.dim + '  ─────────────────────────────────────────' + C.reset);
  printIssues(issues);

  printAISection(parsed.blocks);
  printSitemaps(parsed.sitemaps);
  printScore(score);

  console.log(C.dim + '  Powered by Cirv Lens (coming soon) — AI discoverability for WordPress' + C.reset);
  console.log(C.dim + '  github.com/NickCirv' + C.reset);
  console.log('');
}

main().catch(err => {
  console.error(C.red + 'Fatal: ' + err.message + C.reset);
  process.exit(1);
});
