/**
 * Math Knowledge Graph Crawler
 * Run: node scripts/crawl.js
 *
 * Traverses Wikipedia's Mathematics category tree and builds a knowledge graph
 * of mathematical concepts, saving the result to public/math_graph.json.
 *
 * Strategy:
 *   1. Fetch subcategories of Category:Mathematics (the top-level domains)
 *   2. For each domain, fetch article members
 *   3. Filter out non-concept articles (biographies, lists, admin pages)
 *   4. For each article, fetch outlinks
 *   5. Build undirected edges between articles in our set
 *   6. Prune orphan nodes (no edges)
 *   7. Save JSON
 *
 * Requires: Node.js >= 18 (native fetch)
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseGraphForCrawler } from "./analyseGraph.js";

// Load .env so ANTHROPIC_API_KEY is available without manual export
try {
  const envText = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.env"), "utf8");
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch { /* .env is optional */ }

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../public/math_graph.json");

const WIKI_API = "https://en.wikipedia.org/w/api.php";

// ── Tuning constants ──────────────────────────────────────────────────────────
const MAX_DOMAIN_CATEGORIES = 30;   // max domain categories to crawl
const MAX_ARTICLES_PER_CAT = 30;    // max article members per domain category
const MAX_TOTAL_NODES = 450;        // soft cap on total nodes
const DELAY_MS = 2000;              // ms between API calls (sequential, ~30 req/min)
const MAX_EXTRACT_CHARS = 4000;

// ── Domain categories to crawl ─────────────────────────────────────────────────
// These are Wikipedia categories that contain core mathematical concept articles.
// Using a curated list avoids fetching the top-level Category:Mathematics, which
// returns meta-categories (Mathematicians, Mathematics and art, etc.) rather than
// subject-matter ones.
const DOMAIN_CATEGORIES = [
  "Abstract algebra",
  "Linear algebra",
  "Real analysis",
  "Complex analysis",
  "Functional analysis",
  "Differential geometry",
  "Algebraic geometry",
  "Algebraic topology",
  "General topology",
  "Number theory",
  "Analytic number theory",
  "Combinatorics",
  "Graph theory",
  "Mathematical logic",
  "Set theory",
  "Category theory",
  "Probability theory",
  "Mathematical statistics",
  "Numerical analysis",
  "Differential equations",
  "Mathematical physics",
  "Discrete mathematics",
  "Computability theory",
  "Information theory",
  "Dynamical systems",
  "Measure theory",
  "Operator theory",
  "Representation theory",
  "Commutative algebra",
  "Homological algebra",
];

// ── Article exclusion patterns ────────────────────────────────────────────────
const SKIP_RE = [
  /^\d{4}(s)?$/,
  /^List of /i,
  /\(disambiguation\)/i,
  /^Wikipedia:|^Template:|^Help:|^Portal:|^File:|^Category:|^Draft:/,
  /^Talk:/,
  // Biographical / people
  /^(Deaths|Births) in /i,
  /\b(born \d{4}|died \d{4}|\d{4}–\d{4})\b/i,
  // Institutions
  /University$|University of|Institute of|College of|Academy of/i,
  /^(MIT|UCLA|ETH|CNRS|NSF)\b/,
  // Awards and prizes
  /(Prize|Medal|Award|Fellowship)$/i,
  // Journals and proceedings
  /^(Journal of|Annals of|Transactions of|Proceedings of|Notices of|Bulletin of)/i,
  // Years and decades
  /^\d{4}s in /i,
  // Broad meta-articles
  /^(Outline of|History of|Philosophy of|Areas of|Lists of)/i,
];

// Citation / infrastructure titles (extended from parent project)
const SKIP_TITLES = new Set([
  // Academic infrastructure
  "Semantic Scholar", "Google Scholar", "JSTOR", "OCLC", "WorldCat",
  "PubMed", "PubMed Central", "arXiv", "DOI", "Digital object identifier",
  "ISBN", "ISSN", "LCCN", "CrossRef", "Scopus", "Web of Science",
  "ProQuest", "EBSCOhost", "ResearchGate", "PhilPapers", "SSRN",
  "Academia.edu", "Wayback Machine", "Internet Archive",
  "Project MUSE", "HathiTrust", "OpenLibrary",
  "Library of Congress", "British Library",
  // Degrees
  "Bachelor's degree", "Master's degree", "Doctor of Philosophy",
  "Doctor of Medicine", "Bachelor of Science", "Master of Science",
  // Broad math meta-pages
  "Mathematics", "Mathematician", "Mathematical notation",
  "Areas of mathematics", "Outline of mathematics", "History of mathematics",
  "Pure mathematics", "Applied mathematics",
  "Mathematical structure", "Mathematical object",
  // Too generic
  "Science", "Physics", "Engineering", "Computer science",
  "Natural number", "Rational number", "Real number", "Complex number",
  "Integer", "Number", "Function (mathematics)", "Variable (mathematics)",
  "Infinity", "Zero", "One",
  // People meta
  "Doctoral advisor", "Postdoctoral researcher",
]);

// Some articles are so central to the mathematical landscape that we keep them
// even if they pattern-match exclusion rules. Override here.
const FORCE_INCLUDE = new Set([
  "Real analysis", "Complex analysis", "Functional analysis",
  "Abstract algebra", "Linear algebra",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wikiGet(params) {
  const url = new URL(WIKI_API);
  // Note: no `origin` param — we're in Node.js, not a browser
  Object.entries({ ...params, format: "json" }).forEach(
    ([k, v]) => url.searchParams.set(k, v)
  );

  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res;
    try {
      res = await fetch(url.toString(), {
        headers: {
          "User-Agent": "MathKnowledgeGraphCrawler/1.0 (educational research)",
          "Accept": "application/json",
        },
      });
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
      const wait = DELAY_MS * (attempt + 2);
      console.warn(`  Network error, retrying in ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
      const backoff = DELAY_MS * Math.pow(2, attempt + 1);
      const wait = retryAfter > 0 ? retryAfter * 1000 + 1000 : backoff;
      console.warn(`\n  Rate limited, waiting ${(wait / 1000).toFixed(1)}s...`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error("Max retries exceeded");
}

function isRelevant(title) {
  if (FORCE_INCLUDE.has(title)) return true;
  if (SKIP_TITLES.has(title)) return false;
  const titleLower = title.toLowerCase();
  if ([...SKIP_TITLES].some((t) => t.toLowerCase() === titleLower)) return false;
  return !SKIP_RE.some((re) => re.test(title));
}

function titleToId(title) {
  return title.replace(/\s+/g, "_");
}

// ── Wikipedia API calls ───────────────────────────────────────────────────────

async function fetchSubcategories(categoryTitle) {
  const data = await wikiGet({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${categoryTitle}`,
    cmtype: "subcat",
    cmlimit: "50",
    cmprop: "title|sortkey",
  });
  return (data.query?.categorymembers || []).map((c) =>
    c.title.replace(/^Category:/, "")
  );
}

async function fetchCategoryMembers(categoryTitle, limit = MAX_ARTICLES_PER_CAT) {
  const data = await wikiGet({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${categoryTitle}`,
    cmtype: "page",
    cmlimit: String(limit),
    cmnamespace: "0",
    cmprop: "title",
  });
  return (data.query?.categorymembers || []).map((p) => p.title);
}

/**
 * Fetch a single article's content (used for reliability, single items).
 */
async function fetchArticle(title) {
  const batchResult = await fetchArticlesBatch([title]);
  return batchResult[0] || null;
}

/**
 * Batch-fetch up to 20 articles at once (extracts API limit).
 * Returns array of article objects (nulls filtered out).
 */
async function fetchArticlesBatch(titles) {
  if (titles.length === 0) return [];
  const data = await wikiGet({
    action: "query",
    prop: "extracts|info|categories",
    titles: titles.join("|"),
    redirects: "1",
    explaintext: "1",
    exsectionformat: "plain",
    inprop: "url",
    cllimit: "20",
    clshow: "!hidden",
    exintro: "1",  // Just intro paragraph for speed
  });

  const pages = Object.values(data.query?.pages || {});
  const results = [];

  for (const page of pages) {
    if (!page || page.missing !== undefined) continue;

    const categories = (page.categories || [])
      .map((c) => c.title.replace(/^Category:/, ""))
      .filter(
        (c) =>
          !/Wikipedia|Articles|Pages|CS1|Use |All |Good |Featured |Accuracy/.test(c)
      );

    // Biographical heuristic: if multiple bio categories, skip
    const bioIndicators = categories.filter((c) =>
      /\d{4} birth|\d{4} death|People from|alumni|Mathematicians from/.test(c)
    );
    if (bioIndicators.length >= 2) continue;

    results.push({
      id: titleToId(page.title),
      title: page.title,
      extract: (page.extract || "").slice(0, MAX_EXTRACT_CHARS),
      url: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      categories,
    });
  }

  return results;
}

/**
 * Batch-fetch outlinks for up to 50 articles at once.
 * Returns { title: [outlink titles] }
 */
/**
 * Batch-fetch outlinks for up to 5 articles at once.
 * pllimit applies globally per request, not per article, so keep batches small.
 * Returns { title: [outlink titles] }
 */
async function fetchOutlinksBatch(titles) {
  if (titles.length === 0) return {};
  const data = await wikiGet({
    action: "query",
    prop: "links",
    titles: titles.join("|"),
    pllimit: "max",   // 500 for anon; split evenly across articles in batch
    plnamespace: "0",
    redirects: "1",
  });
  const result = {};
  // Initialize all requested titles (even if no results returned)
  titles.forEach((t) => { result[t] = []; });
  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    if (page.title) {
      result[page.title] = (page.links || []).map((l) => l.title);
    }
  }
  // Handle redirects: map redirected-from titles
  const redirects = data.query?.redirects || [];
  for (const r of redirects) {
    if (result[r.to] && !result[r.from]) {
      result[r.from] = result[r.to];
    }
  }
  return result;
}

// ── Batched fetch with rate limiting ─────────────────────────────────────────

async function batchFetch(items, fn, batchSize = 5, label = "") {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item) => fn(item).catch(() => null)));
    results.push(...batchResults);
    if (label) {
      const done = Math.min(i + batchSize, items.length);
      process.stdout.write(`\r  ${label}: ${done}/${items.length}  `);
    }
    // Always wait between batches to avoid rate limiting
    await sleep(DELAY_MS);
  }
  if (label) console.log();
  return results;
}

// ── Main crawler ──────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Mathematics Knowledge Graph Crawler ===\n");
  // Brief pause before starting
  await sleep(1000);

  // ── Phase 1: Domain categories ──────────────────────────────────────────────
  console.log("Phase 1: Using curated domain categories...");
  const domainCategories = DOMAIN_CATEGORIES.slice(0, MAX_DOMAIN_CATEGORIES);
  console.log(`  Using ${domainCategories.length} domain categories:`);
  domainCategories.forEach((c) => console.log(`    · ${c}`));

  // ── Phase 2: Harvest articles from each domain ───────────────────────────────
  console.log("\nPhase 2: Harvesting articles from domain categories...");

  const domainArticleMap = {}; // category → [title]
  for (const domain of domainCategories) {
    await sleep(DELAY_MS);
    const members = await fetchCategoryMembers(domain, MAX_ARTICLES_PER_CAT);
    const filtered = members.filter(isRelevant);
    domainArticleMap[domain] = filtered;
    console.log(`  ${domain}: ${filtered.length} articles`);
  }

  // Assign each article to its primary domain (first domain that claimed it)
  const articleDomainMap = {}; // title → domain
  const allCandidates = [];

  for (const [domain, titles] of Object.entries(domainArticleMap)) {
    for (const title of titles) {
      if (!articleDomainMap[title]) {
        articleDomainMap[title] = domain;
        allCandidates.push(title);
      }
    }
    if (allCandidates.length >= MAX_TOTAL_NODES) break;
  }

  console.log(`\n  Total candidate articles: ${allCandidates.length}`);

  // ── Phase 3: Fetch full article data (batched 20 articles/request) ───────────
  console.log("\nPhase 3: Fetching article content...");
  const candidateSlice = allCandidates.slice(0, MAX_TOTAL_NODES);
  const ARTICLE_BATCH = 20;
  const articleResults = [];
  let artBatchNum = 0;
  const totalArtBatches = Math.ceil(candidateSlice.length / ARTICLE_BATCH);

  for (let i = 0; i < candidateSlice.length; i += ARTICLE_BATCH) {
    const batch = candidateSlice.slice(i, i + ARTICLE_BATCH);
    artBatchNum++;
    process.stdout.write(`\r  Article batch: ${artBatchNum}/${totalArtBatches}  `);
    try {
      const batchResult = await fetchArticlesBatch(batch);
      articleResults.push(...batchResult);
    } catch (err) {
      console.warn(`\n  Batch ${artBatchNum} failed: ${err.message}`);
    }
    if (i + ARTICLE_BATCH < candidateSlice.length) await sleep(DELAY_MS);
  }
  console.log();

  const articles = articleResults
    .map((a) => ({ ...a, mathDomain: articleDomainMap[a.title] || "Mathematics" }));

  console.log(`  Fetched ${articles.length} valid articles`);

  // ── Phase 4: Fetch outlinks for edge building (batched 50 articles/request) ───
  console.log("\nPhase 4: Fetching outlinks for edge construction...");
  const articleTitles = articles.map((a) => a.title);
  const OUTLINK_BATCH = 5;   // pllimit is global per request, keep batches small
  const articleOutlinks = {};
  let batchNum = 0;
  const totalBatches = Math.ceil(articleTitles.length / OUTLINK_BATCH);

  for (let i = 0; i < articleTitles.length; i += OUTLINK_BATCH) {
    const batch = articleTitles.slice(i, i + OUTLINK_BATCH);
    batchNum++;
    process.stdout.write(`\r  Outlinks batch: ${batchNum}/${totalBatches}  `);
    try {
      const batchResult = await fetchOutlinksBatch(batch);
      Object.assign(articleOutlinks, batchResult);
    } catch (err) {
      console.warn(`\n  Batch ${batchNum} failed: ${err.message}, using empty outlinks`);
      batch.forEach((t) => { articleOutlinks[t] = []; });
    }
    if (i + OUTLINK_BATCH < articleTitles.length) await sleep(DELAY_MS);
  }
  console.log();

  // ── Phase 5: Build edge graph ────────────────────────────────────────────────
  console.log("\nPhase 5: Building edge graph...");

  const titleSet = new Set(articles.map((a) => a.title));
  const idMap = Object.fromEntries(articles.map((a) => [a.title, a.id]));
  const edgeSet = new Set();
  const edges = [];

  for (const article of articles) {
    const outlinks = articleOutlinks[article.title] || [];
    for (const targetTitle of outlinks) {
      if (titleSet.has(targetTitle) && targetTitle !== article.title) {
        const key = [article.id, idMap[targetTitle]].sort().join("|||");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: article.id, target: idMap[targetTitle] });
        }
      }
    }
  }

  // ── Phase 6: Prune orphan nodes ──────────────────────────────────────────────
  console.log("\nPhase 6: Pruning orphan nodes...");
  const connectedNodeIds = new Set();
  edges.forEach(({ source, target }) => {
    connectedNodeIds.add(source);
    connectedNodeIds.add(target);
  });

  const nodes = articles.filter((a) => connectedNodeIds.has(a.id));
  const prunedCount = articles.length - nodes.length;
  if (prunedCount > 0) {
    console.log(`  Pruned ${prunedCount} orphan nodes`);
  }

  // ── Phase 7: Summary and save ────────────────────────────────────────────────
  const domainCounts = {};
  nodes.forEach((n) => {
    domainCounts[n.mathDomain] = (domainCounts[n.mathDomain] || 0) + 1;
  });

  console.log("\n=== Graph Summary ===");
  console.log(`  Nodes: ${nodes.length}`);
  console.log(`  Edges: ${edges.length}`);
  console.log(`  Avg degree: ${((edges.length * 2) / nodes.length).toFixed(1)}`);
  console.log("\n  Nodes per domain:");
  Object.entries(domainCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([domain, count]) => console.log(`    ${domain}: ${count}`));

  // ── Phase 8: Claude analysis (pre-bakes community labels + bridge explanations) ─
  console.log("\nPhase 8: Claude analysis...");
  const insights = await analyseGraphForCrawler(nodes, edges);

  const output = {
    meta: {
      crawledAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      domains: Object.keys(domainCounts).sort(),
      ...(insights && { insights }),
    },
    nodes,
    edges,
  };

  mkdirSync(resolve(__dirname, "../public"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n  Saved to: ${OUTPUT_PATH}`);
  console.log("\nDone. Run `npm run dev` to view the graph.");
}

main().catch((err) => {
  console.error("Crawler failed:", err);
  process.exit(1);
});
