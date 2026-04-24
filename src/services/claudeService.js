import Anthropic from "@anthropic-ai/sdk";

/**
 * Sends the graph topology to Claude for:
 *   1. Community labeling with formal mathematical terminology
 *   2. Bridge node explanation
 *   3. Structural gap analysis (subfields absent from the graph)
 *
 * Expected response schema:
 * {
 *   "communities": { "<id>": { "label": "...", "explanation": "..." } },
 *   "bridges": [{ "title": "...", "explanation": "..." }],
 *   "gaps": [{ "subfield": "...", "reason": "..." }]
 * }
 */
export async function analyseGraph({ nodes, edges, communities, centrality }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("VITE_ANTHROPIC_API_KEY not set in .env");

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  // Group node titles by community
  const communityGroups = {};
  nodes.forEach((n) => {
    const c = communities[n.id] ?? 0;
    if (!communityGroups[c]) communityGroups[c] = [];
    communityGroups[c].push(n.title);
  });

  // Group by mathDomain for context
  const domainGroups = {};
  nodes.forEach((n) => {
    const d = n.mathDomain || "Unknown";
    if (!domainGroups[d]) domainGroups[d] = 0;
    domainGroups[d]++;
  });

  const topBridges = Object.entries(centrality)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([id]) => nodes.find((n) => n.id === id)?.title)
    .filter(Boolean);

  const communityBlock = Object.entries(communityGroups)
    .map(
      ([c, titles]) =>
        `  Community ${c} (${titles.length} nodes): ${titles.join(", ")}`
    )
    .join("\n");

  const domainBlock = Object.entries(domainGroups)
    .sort(([, a], [, b]) => b - a)
    .map(([d, count]) => `  ${d}: ${count} nodes`)
    .join("\n");

  const edgeCount = edges.length;
  const avgDegree =
    nodes.length > 0 ? ((edgeCount * 2) / nodes.length).toFixed(1) : 0;

  const prompt = `You are analysing a permanent knowledge graph of mathematical concepts, built by systematically crawling Wikipedia's Mathematics category tree. The graph captures the epistemological structure of mathematics as encoded in Wikipedia's hyperlink network — not curated by a human, but emergent from how editors link mathematical articles.

GRAPH PROVENANCE:
- Source: Wikipedia Mathematics category tree (systematic category-based harvest)
- Scope: ${nodes.length} mathematical concept articles, ${edgeCount} hyperlink-derived edges
- Average connectivity: ${avgDegree} edges per node

WIKIPEDIA CATEGORIES REPRESENTED (nodes per category):
${domainBlock}

LINK-TOPOLOGY COMMUNITIES (detected via label propagation on the hyperlink graph):
${communityBlock}

HIGHEST BETWEENNESS CENTRALITY (structural bridges — concepts that connect otherwise distant regions):
${topBridges.join(", ")}

TASK — return a single JSON object with three keys:

1. "communities" — for each detected community, provide:
   - "label": formal mathematical discipline name (2–5 words; use standard mathematical terminology, e.g., "Algebraic Topology", "Harmonic Analysis", "Combinatorial Number Theory")
   - "explanation": 2 sentences explaining what mathematical tradition this community represents and why Wikipedia's link structure grouped these articles together

2. "bridges" — for the top 4 bridge articles by betweenness centrality, explain in 1–2 sentences what intellectual function makes them central connectors between different mathematical communities

3. "gaps" — identify 4–5 significant subfields of mathematics that appear to be absent or underrepresented in this graph. For each:
   - "subfield": name of the absent or underrepresented mathematical area
   - "reason": 1 sentence explaining why the category-based crawl likely missed it and what it would connect if included

Return ONLY valid JSON, no prose before or after:
{
  "communities": {
    "0": { "label": "...", "explanation": "..." },
    "1": { "label": "...", "explanation": "..." }
  },
  "bridges": [
    { "title": "...", "explanation": "..." }
  ],
  "gaps": [
    { "subfield": "...", "reason": "..." }
  ]
}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].text;
  const cleaned = text.replace(/^```(?:json)?\n?|\n?```$/gm, "").trim();
  return JSON.parse(cleaned);
}
