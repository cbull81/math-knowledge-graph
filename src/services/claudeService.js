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

  const prompt = `You are a mathematician analysing the conceptual structure of mathematics through a knowledge graph of ${nodes.length} mathematical concepts and their relationships.

The graph was built from Wikipedia articles, but your task is to explain the underlying mathematical reality — how these concepts genuinely depend on, generalise, or illuminate each other. Treat the graph topology as evidence of real mathematical relationships, not as an artifact of how a website happens to be organised.

CONCEPTS GROUPED BY DETECTED COMMUNITY (communities found via link-topology clustering):
${communityBlock}

CONCEPTS WITH HIGHEST STRUCTURAL CENTRALITY (ideas that mathematically connect the most other concepts):
${topBridges.join(", ")}

TASK — return a single JSON object with three keys:

1. "communities" — for each community, provide:
   - "label": a precise mathematical discipline name (2–5 words, e.g. "Algebraic Topology", "Spectral Theory", "Analytic Number Theory")
   - "explanation": 2 sentences describing what mathematical ideas unite this cluster and what deep conceptual thread runs through them — focus on the mathematics, not on how the articles are linked

2. "bridges" — for each high-centrality concept, 1–2 sentences explaining what mathematical role makes it foundational across multiple fields: what does it generalise, what does it make possible, and which otherwise-separate areas of mathematics does it connect?

3. "gaps" — 4–5 important mathematical concepts or subfields that are absent from this graph but would deepen it. For each:
   - "subfield": name of the missing area
   - "reason": 1 sentence on what mathematical connections it would add — which existing concepts it links to and what it would reveal about the structure of the field

Write as a mathematician explaining to another mathematician. Do not mention Wikipedia, link structure, or crawling.

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
