/**
 * Brandes algorithm for betweenness centrality (undirected, unweighted).
 * O(VE) — suitable for graphs up to ~500 nodes in-browser.
 */
export function computeBetweenness(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
  const n = nodes.length;

  const adj = Array.from({ length: n }, () => []);
  edges.forEach(({ source, target }) => {
    const s = idx[source];
    const t = idx[target];
    if (s !== undefined && t !== undefined && s !== t) {
      adj[s].push(t);
      adj[t].push(s);
    }
  });

  const cb = new Float64Array(n);

  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Float64Array(n);
    sigma[s] = 1;
    const dist = new Int32Array(n).fill(-1);
    dist[s] = 0;
    const queue = [s];
    let head = 0;

    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          queue.push(w);
          dist[w] = dist[v] + 1;
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }

    const delta = new Float64Array(n);
    while (stack.length > 0) {
      const w = stack.pop();
      for (const v of pred[w]) {
        delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      if (w !== s) cb[w] += delta[w];
    }
  }

  const norm = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1;
  const result = {};
  ids.forEach((id, i) => {
    result[id] = cb[i] * norm;
  });
  return result;
}

/**
 * Label propagation community detection.
 * Stochastic — runs until convergence or MAX_ITER.
 */
export function detectCommunities(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
  const n = nodes.length;

  const adj = Array.from({ length: n }, () => []);
  edges.forEach(({ source, target }) => {
    const s = idx[source];
    const t = idx[target];
    if (s !== undefined && t !== undefined && s !== t) {
      adj[s].push(t);
      adj[t].push(s);
    }
  });

  const labels = Array.from({ length: n }, (_, i) => i);

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (const v of shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (adj[v].length === 0) continue;
      const counts = {};
      for (const w of adj[v]) {
        counts[labels[w]] = (counts[labels[w]] || 0) + 1;
      }
      let best = labels[v];
      let bestCount = 0;
      for (const [label, count] of Object.entries(counts)) {
        const l = Number(label);
        if (count > bestCount || (count === bestCount && l < best)) {
          bestCount = count;
          best = l;
        }
      }
      if (best !== labels[v]) {
        labels[v] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Remap to 0-based sequential IDs, largest community = 0
  const freq = {};
  labels.forEach((l) => { freq[l] = (freq[l] || 0) + 1; });
  const sorted = Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .map(([l]) => Number(l));
  const remap = Object.fromEntries(sorted.map((l, i) => [l, i]));

  const result = {};
  ids.forEach((id, i) => {
    result[id] = remap[labels[i]];
  });
  return result;
}

/**
 * Min-max normalise a { key: value } map to [0, 1].
 */
export function normalise(valueMap) {
  const vals = Object.values(valueMap);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const out = {};
  for (const [k, v] of Object.entries(valueMap)) {
    out[k] = (v - min) / range;
  }
  return out;
}
