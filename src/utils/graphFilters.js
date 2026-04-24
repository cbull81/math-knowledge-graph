/**
 * Pure filter/search utilities for the math knowledge graph.
 * No React dependencies — usable in both components and analysis utils.
 */

/**
 * Apply all active filters and return the set of visible node IDs.
 * Logic is additive (AND): a node must pass all active filters.
 *
 * @param {Array}  nodes         - full node list from graph JSON
 * @param {Object} normCentrality - { nodeId: 0-1 }
 * @param {Object} communities    - { nodeId: communityIndex }
 * @param {Object} filters        - { searchQuery, communityFilter, minCentrality }
 * @returns {Set<string>}
 */
export function applyFilters(nodes, normCentrality, communities, filters) {
  const { searchQuery = "", communityFilter = null, minCentrality = 0 } = filters;
  const queryLower = searchQuery.toLowerCase().trim();
  const threshold = minCentrality / 100;

  const visible = new Set();
  for (const node of nodes) {
    if (queryLower && !node.title.toLowerCase().includes(queryLower)) continue;
    if (communityFilter !== null && communities[node.id] !== communityFilter) continue;
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
 * Compute approximate centroids for each community from positioned node data.
 * Call this after D3 simulation has settled (positions available on node objects).
 *
 * @param {Array}  positionedNodes - D3 simulation nodes with .x and .y
 * @param {Object} communities     - { nodeId: communityIndex }
 * @returns {Object}               - { communityIndex: { x, y } }
 */
export function computeCommunityCentroids(positionedNodes, communities) {
  const sums = {};
  for (const node of positionedNodes) {
    const c = communities[node.id];
    if (c === undefined || node.x === undefined) continue;
    if (!sums[c]) sums[c] = { x: 0, y: 0, count: 0 };
    sums[c].x += node.x;
    sums[c].y += node.y;
    sums[c].count += 1;
  }
  const centroids = {};
  for (const [c, s] of Object.entries(sums)) {
    centroids[c] = { x: s.x / s.count, y: s.y / s.count };
  }
  return centroids;
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
