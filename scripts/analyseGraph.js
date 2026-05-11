/**
 * Shared Claude analysis for crawler scripts.
 * Runs community detection + betweenness centrality, then asks Claude to label
 * communities and explain high-centrality bridge concepts.
 *
 * Uses ANTHROPIC_API_KEY from the environment (set in .env or shell).
 * Returns null (with a warning) if the key is absent — graph still saves fine.
 */

import Anthropic from "@anthropic-ai/sdk";
import { computeBetweenness, detectCommunities } from "../src/utils/graphAnalysis.js";

export async function analyseGraphForCrawler(nodes, edges) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "\n  ANTHROPIC_API_KEY not set — skipping Claude analysis.\n" +
      "  Set it in .env or your shell, then re-run the crawler to pre-bake insights."
    );
    return null;
  }

  try {
    return await _runAnalysis(nodes, edges, apiKey);
  } catch (err) {
    console.warn(`\n  Claude analysis failed (${err.message}) — graph will save without insights.`);
    return null;
  }
}

async function _runAnalysis(nodes, edges, apiKey) {

  process.stdout.write("  Running community detection + betweenness...");
  const communities = detectCommunities(nodes, edges);
  const centrality = computeBetweenness(nodes, edges);
  console.log(" done");

  process.stdout.write("  Calling Claude for community labels and bridge analysis...");

  const client = new Anthropic({ apiKey });

  const communityGroups = {};
  nodes.forEach((n) => {
    const c = communities[n.id] ?? 0;
    if (!communityGroups[c]) communityGroups[c] = [];
    communityGroups[c].push(n.title);
  });

  const topBridges = Object.entries(centrality)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([id]) => nodes.find((n) => n.id === id)?.title)
    .filter(Boolean);

  const communityBlock = Object.entries(communityGroups)
    .map(([c, titles]) => `  Community ${c} (${titles.length} nodes): ${titles.join(", ")}`)
    .join("\n");

  const prompt = `You are a mathematician analysing the conceptual structure of mathematics through a knowledge graph of ${nodes.length} mathematical concepts and their relationships.

The graph was built from Wikipedia articles, but your task is to explain the underlying mathematical reality — how these concepts genuinely depend on, generalise, or illuminate each other. Treat the graph topology as evidence of real mathematical relationships, not as an artifact of how a website happens to be organised.

CONCEPTS GROUPED BY DETECTED COMMUNITY (communities found via link-topology clustering):
${communityBlock}

CONCEPTS WITH HIGHEST STRUCTURAL CENTRALITY (ideas that mathematically connect the most other concepts):
${topBridges.join(", ")}

TASK — return a single JSON object with two keys:

1. "communities" — for each community, provide:
   - "label": a precise mathematical discipline name (2–5 words, e.g. "Algebraic Topology", "Spectral Theory", "Analytic Number Theory")
   - "explanation": 2 sentences describing what mathematical ideas unite this cluster and what deep conceptual thread runs through them — focus on the mathematics, not on how the articles are linked

2. "bridges" — for each high-centrality concept, 1–2 sentences explaining what mathematical role makes it foundational across multiple fields: what does it generalise, what does it make possible, and which otherwise-separate areas of mathematics does it connect?

Write as a mathematician explaining to another mathematician. Do not mention Wikipedia, link structure, or crawling.

Return ONLY valid JSON, no prose before or after:
{
  "communities": {
    "0": { "label": "...", "explanation": "..." },
    "1": { "label": "...", "explanation": "..." }
  },
  "bridges": [
    { "title": "...", "explanation": "..." }
  ]
}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].text;
  const cleaned = text.replace(/^```(?:json)?\n?|\n?```$/gm, "").trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (err) {
    console.warn(`\n  Claude returned unparseable JSON (${err.message}) — skipping insights.`);
    return null;
  }

  console.log(" done");
  return result;
}
