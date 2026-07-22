/**
 * Pure filter/search utilities for the math knowledge graph.
 * No React dependencies — usable in both components and analysis utils.
 */

const DOMAIN_PALETTE = [
  "#78B4D4", "#D4A878", "#A878D4", "#78D4A8",
  "#D47878", "#D4D478", "#78D4D4", "#D478A8",
  "#88B478", "#B49878", "#A8B4D4", "#D4B8A8",
  "#78A8D4", "#D478D4", "#A8D478", "#C4A060",
  "#7890D4", "#D47898", "#98D478", "#D490A8",
  "#78C4B4", "#B4C478", "#C478B4", "#90B4D4",
  "#D4B060", "#A090D4", "#D4786C", "#78D4C4",
  "#B4D090", "#D4A0C4",
];

function hashStr(s) {
  let h = 0;
  for (const c of (s || "")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return h;
}

export function domainColor(domain) {
  return DOMAIN_PALETTE[hashStr(domain) % DOMAIN_PALETTE.length];
}

/**
 * Apply all active filters and return the set of visible node IDs.
 * Logic is additive (AND): a node must pass all active filters.
 *
 * @param {Array}  nodes          - full node list from graph JSON
 * @param {Object} normCentrality - { nodeId: 0-1 }
 * @param {Object} filters        - { searchQuery, domainFilter, minCentrality }
 * @returns {Set<string>}
 */
export function applyFilters(nodes, normCentrality, filters) {
  const { searchQuery = "", domainFilter = null, minCentrality = 0 } = filters;
  const queryLower = searchQuery.toLowerCase().trim();
  const threshold = minCentrality / 100;

  const visible = new Set();
  for (const node of nodes) {
    if (queryLower && !node.title.toLowerCase().includes(queryLower)) continue;
    if (domainFilter !== null && node.mathDomain !== domainFilter) continue;
    if (threshold > 0 && (normCentrality[node.id] || 0) < threshold) continue;
    visible.add(node.id);
  }
  return visible;
}

/**
 * Return the set of node IDs connected to a given node (for selection highlight).
 */
export function getNeighbourIds(nodeId, edges) {
  const neighbours = new Set([nodeId]);
  for (const { source, target } of edges) {
    if (source === nodeId) neighbours.add(target);
    if (target === nodeId) neighbours.add(source);
  }
  return neighbours;
}

/**
 * Build a fast title → node lookup map.
 */
export function buildNodeIndex(nodes) {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * Group nodes by mathDomain and return counts + sorted list.
 * Used by InfoPanel for the domain breakdown display.
 */
export function getDomainBreakdown(nodes) {
  const counts = {};
  for (const node of nodes) {
    const d = node.mathDomain || "Unknown";
    counts[d] = (counts[d] || 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a);
}

/**
 * Compute radial initial positions for nodes, one sector per domain.
 * Called before simulation starts to seed better initial layout.
 *
 * @param {Array}  nodes  - node list
 * @param {number} width
 * @param {number} height
 * @returns {Object} - { nodeId: { x, y } }
 */
export function computeRadialInitialPositions(nodes, width, height) {
  const domains = [...new Set(nodes.map((n) => n.mathDomain || "Unknown"))];
  const domainAngle = {};
  domains.forEach((d, i) => {
    domainAngle[d] = (2 * Math.PI * i) / domains.length;
  });

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;

  const positions = {};
  const domainOffsets = {};

  for (const node of nodes) {
    const domain = node.mathDomain || "Unknown";
    const angle = domainAngle[domain];
    const offset = domainOffsets[domain] || 0;
    domainOffsets[domain] = offset + 1;

    // Scatter nodes within their domain sector
    const scatter = radius * 0.4;
    const angleJitter = (Math.random() - 0.5) * ((2 * Math.PI) / domains.length) * 0.6;
    const radialJitter = (Math.random() - 0.5) * scatter;

    positions[node.id] = {
      x: cx + (radius + radialJitter) * Math.cos(angle + angleJitter),
      y: cy + (radius + radialJitter) * Math.sin(angle + angleJitter),
    };
  }

  return positions;
}
