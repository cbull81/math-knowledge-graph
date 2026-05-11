/**
 * Math Knowledge Graph — Quick-start crawler
 * Run: node scripts/quickstart.js
 *
 * Fetches a curated list of ~60 key mathematical articles and their outlinks.
 * Produces a smaller but immediately usable graph in ~3 minutes.
 * Use this while waiting for the full crawler (npm run crawl) rate limit to expire.
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
const DELAY_MS = 1500;
const MAX_EXTRACT_CHARS = 4000;

// ── Curated seed articles covering major mathematical domains ─────────────────
// Grouped by domain for the mathDomain metadata field.
const SEED_ARTICLES = [
  // Abstract Algebra
  { title: "Group theory", domain: "Abstract algebra" },
  { title: "Ring theory", domain: "Abstract algebra" },
  { title: "Field (mathematics)", domain: "Abstract algebra" },
  { title: "Module (mathematics)", domain: "Abstract algebra" },
  { title: "Galois theory", domain: "Abstract algebra" },

  // Linear Algebra
  { title: "Linear algebra", domain: "Linear algebra" },
  { title: "Matrix (mathematics)", domain: "Linear algebra" },
  { title: "Eigenvalues and eigenvectors", domain: "Linear algebra" },
  { title: "Vector space", domain: "Linear algebra" },
  { title: "Inner product space", domain: "Linear algebra" },

  // Real & Complex Analysis
  { title: "Real analysis", domain: "Real analysis" },
  { title: "Metric space", domain: "Real analysis" },
  { title: "Continuous function", domain: "Real analysis" },
  { title: "Differentiation (calculus)", domain: "Real analysis" },
  { title: "Complex analysis", domain: "Complex analysis" },
  { title: "Holomorphic function", domain: "Complex analysis" },
  { title: "Riemann surface", domain: "Complex analysis" },

  // Functional Analysis
  { title: "Functional analysis", domain: "Functional analysis" },
  { title: "Banach space", domain: "Functional analysis" },
  { title: "Hilbert space", domain: "Functional analysis" },
  { title: "Operator theory", domain: "Functional analysis" },

  // Topology
  { title: "Topology", domain: "General topology" },
  { title: "Topological space", domain: "General topology" },
  { title: "Homeomorphism", domain: "General topology" },
  { title: "Algebraic topology", domain: "Algebraic topology" },
  { title: "Fundamental group", domain: "Algebraic topology" },
  { title: "Homology (mathematics)", domain: "Algebraic topology" },
  { title: "Differential geometry", domain: "Differential geometry" },
  { title: "Riemannian manifold", domain: "Differential geometry" },
  { title: "Manifold", domain: "Differential geometry" },

  // Number Theory
  { title: "Number theory", domain: "Number theory" },
  { title: "Prime number", domain: "Number theory" },
  { title: "Modular arithmetic", domain: "Number theory" },
  { title: "Diophantine equation", domain: "Number theory" },
  { title: "Algebraic number theory", domain: "Number theory" },
  { title: "Analytic number theory", domain: "Analytic number theory" },
  { title: "Riemann zeta function", domain: "Analytic number theory" },

  // Combinatorics & Graph Theory
  { title: "Combinatorics", domain: "Combinatorics" },
  { title: "Graph theory", domain: "Graph theory" },
  { title: "Permutation", domain: "Combinatorics" },
  { title: "Generating function", domain: "Combinatorics" },

  // Logic & Foundations
  { title: "Mathematical logic", domain: "Mathematical logic" },
  { title: "Set theory", domain: "Set theory" },
  { title: "Model theory", domain: "Mathematical logic" },
  { title: "Proof theory", domain: "Mathematical logic" },
  { title: "Computability theory", domain: "Computability theory" },
  { title: "Category theory", domain: "Category theory" },
  { title: "Functor", domain: "Category theory" },

  // Probability & Statistics
  { title: "Probability theory", domain: "Probability theory" },
  { title: "Measure theory", domain: "Measure theory" },
  { title: "Stochastic process", domain: "Probability theory" },
  { title: "Markov chain", domain: "Probability theory" },
  { title: "Statistics", domain: "Mathematical statistics" },

  // Differential Equations & Dynamical Systems
  { title: "Differential equation", domain: "Differential equations" },
  { title: "Partial differential equation", domain: "Differential equations" },
  { title: "Dynamical system", domain: "Dynamical systems" },
  { title: "Chaos theory", domain: "Dynamical systems" },

  // Other
  { title: "Representation theory", domain: "Representation theory" },
  { title: "Algebraic geometry", domain: "Algebraic geometry" },
  { title: "Commutative algebra", domain: "Commutative algebra" },
  { title: "Homological algebra", domain: "Homological algebra" },
  { title: "Numerical analysis", domain: "Numerical analysis" },
  { title: "Information theory", domain: "Information theory" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function wikiGet(params) {
  const url = new URL(WIKI_API);
  Object.entries({ ...params, format: "json" }).forEach(([k, v]) =>
    url.searchParams.set(k, v)
  );
  const maxAttempts = 4;
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
      await sleep(DELAY_MS * (attempt + 2));
      continue;
    }
    if (res.status === 429) {
      const wait = DELAY_MS * Math.pow(2, attempt + 1);
      console.warn(`\n  Rate limited, waiting ${(wait / 1000).toFixed(1)}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }
  throw new Error("Max retries exceeded");
}

function titleToId(title) {
  return title.replace(/\s+/g, "_");
}

async function fetchArticlesBatch(titles) {
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
    exintro: "1",
  });

  const pages = Object.values(data.query?.pages || {});
  const results = [];
  for (const page of pages) {
    if (!page || page.missing !== undefined) continue;
    const categories = (page.categories || [])
      .map((c) => c.title.replace(/^Category:/, ""))
      .filter((c) => !/Wikipedia|Articles|Pages|CS1|Use |All |Good |Featured/.test(c));
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

async function fetchOutlinksBatch(titles) {
  // pllimit is global per API call, not per article.
  // Use max (500) — with small batches of 5-10 this gives ~50-100 links/article.
  const data = await wikiGet({
    action: "query",
    prop: "links",
    titles: titles.join("|"),
    pllimit: "max",
    plnamespace: "0",
    redirects: "1",
  });
  const result = {};
  titles.forEach((t) => { result[t] = []; });
  const pages = Object.values(data.query?.pages || {});
  for (const page of pages) {
    if (page.title) {
      result[page.title] = (page.links || []).map((l) => l.title);
    }
  }
  return result;
}

async function main() {
  console.log("=== Math Knowledge Graph — Quick-start ===");
  console.log(`  Fetching ${SEED_ARTICLES.length} curated articles\n`);

  // Build domain lookup
  const domainMap = Object.fromEntries(SEED_ARTICLES.map((s) => [s.title, s.domain]));

  // ── Phase 1: Fetch article content (20 per batch) ────────────────────────────
  const titles = SEED_ARTICLES.map((s) => s.title);
  const ARTICLE_BATCH = 20;
  const articleResults = [];

  for (let i = 0; i < titles.length; i += ARTICLE_BATCH) {
    const batch = titles.slice(i, i + ARTICLE_BATCH);
    const batchNum = Math.floor(i / ARTICLE_BATCH) + 1;
    const total = Math.ceil(titles.length / ARTICLE_BATCH);
    process.stdout.write(`\r  Articles: batch ${batchNum}/${total}  `);
    try {
      const batchResult = await fetchArticlesBatch(batch);
      articleResults.push(...batchResult);
    } catch (err) {
      console.warn(`\n  Batch ${batchNum} failed: ${err.message}`);
    }
    if (i + ARTICLE_BATCH < titles.length) await sleep(DELAY_MS);
  }
  console.log(`\n  Got ${articleResults.length} articles`);

  const articles = articleResults.map((a) => ({
    ...a,
    mathDomain: domainMap[a.title] || "Mathematics",
  }));

  // ── Phase 2: Fetch outlinks (5 per batch — pllimit is global per request) ────
  const OUTLINK_BATCH = 5;
  const articleOutlinks = {};

  for (let i = 0; i < articles.length; i += OUTLINK_BATCH) {
    const batch = articles.slice(i, i + OUTLINK_BATCH).map((a) => a.title);
    const batchNum = Math.floor(i / OUTLINK_BATCH) + 1;
    const total = Math.ceil(articles.length / OUTLINK_BATCH);
    process.stdout.write(`\r  Outlinks: batch ${batchNum}/${total}  `);
    try {
      const batchResult = await fetchOutlinksBatch(batch);
      Object.assign(articleOutlinks, batchResult);
    } catch (err) {
      console.warn(`\n  Outlinks batch ${batchNum} failed: ${err.message}`);
    }
    if (i + OUTLINK_BATCH < articles.length) await sleep(DELAY_MS);
  }
  console.log();

  // ── Phase 3: Build edge graph ────────────────────────────────────────────────
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

  // Prune orphans
  const connected = new Set();
  edges.forEach(({ source, target }) => { connected.add(source); connected.add(target); });
  const nodes = articles.filter((a) => connected.has(a.id));

  const domainCounts = {};
  nodes.forEach((n) => {
    domainCounts[n.mathDomain] = (domainCounts[n.mathDomain] || 0) + 1;
  });

  console.log("\n=== Graph Summary ===");
  console.log(`  Nodes: ${nodes.length}`);
  console.log(`  Edges: ${edges.length}`);
  console.log(`  Avg degree: ${((edges.length * 2) / nodes.length).toFixed(1)}`);

  // ── Phase 4: Claude analysis (pre-bakes community labels + bridge explanations) ─
  console.log("\nPhase 4: Claude analysis...");
  const insights = await analyseGraphForCrawler(nodes, edges);

  const output = {
    meta: {
      crawledAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      domains: Object.keys(domainCounts).sort(),
      note: "Quick-start dataset (curated). Run `npm run crawl` for the full graph.",
      ...(insights && { insights }),
    },
    nodes,
    edges,
  };

  mkdirSync(resolve(__dirname, "../public"), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n  Saved to: ${OUTPUT_PATH}`);
  console.log("  Run `npm run dev` to view the graph.");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
