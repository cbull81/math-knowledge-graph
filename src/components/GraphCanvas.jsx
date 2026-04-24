import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { computeRadialInitialPositions } from "../utils/graphFilters.js";

const COMMUNITY_COLORS = [
  "#78B4D4", "#D4A878", "#A878D4", "#78D4A8",
  "#D47878", "#D4D478", "#78D4D4", "#D478A8",
  "#88B478", "#B49878", "#A8B4D4", "#D4B8A8",
  "#78A8D4", "#D478D4", "#A8D478",
];

function communityColor(c) {
  return COMMUNITY_COLORS[c % COMMUNITY_COLORS.length];
}

function nodeRadius(normCentrality, nodeId) {
  return 5 + (normCentrality[nodeId] || 0) * 12;
}

/**
 * Three-tier label visibility:
 *   Tier 1 (centrality > 0.65): always visible
 *   Tier 2 (centrality > 0.30): visible when zoom >= 1.5
 *   Tier 3 (rest): tooltip only (no persistent label)
 */
function getLabelTier(normCentralityValue) {
  if (normCentralityValue >= 0.65) return 1;
  if (normCentralityValue >= 0.3) return 2;
  return 3;
}

export default function GraphCanvas({
  nodes,
  edges,
  communities,
  normCentrality,
  communityLabels,
  visibleNodeIds,
  onNodeClick,
  selectedId,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const [dims, setDims] = useState({ width: 900, height: 650 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tooltip, setTooltip] = useState(null); // { x, y, title }

  // Observe container dimensions
  useEffect(() => {
    const observe = () => {
      if (containerRef.current) {
        setDims({
          width: containerRef.current.clientWidth || 900,
          height: Math.max(500, window.innerHeight - 96),
        });
      }
    };
    observe();
    window.addEventListener("resize", observe);
    return () => window.removeEventListener("resize", observe);
  }, []);

  // ── Main simulation + rendering effect ────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !svgRef.current || nodes.length === 0) return;

    const { width, height } = dims;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = width;
    canvas.height = height;

    // Filter nodes/edges to visible set
    const visibleNodes = visibleNodeIds
      ? nodes.filter((n) => visibleNodeIds.has(n.id))
      : nodes;
    const visibleEdges = visibleNodeIds
      ? edges.filter(
          (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        )
      : edges;

    // Compute initial radial positions
    const initialPositions = computeRadialInitialPositions(visibleNodes, width, height);

    // Prepare simulation nodes with initial positions
    const simNodes = visibleNodes.map((n) => ({
      ...n,
      x: initialPositions[n.id]?.x ?? width / 2 + (Math.random() - 0.5) * 100,
      y: initialPositions[n.id]?.y ?? height / 2 + (Math.random() - 0.5) * 100,
    }));
    const simNodeById = Object.fromEntries(simNodes.map((n) => [n.id, n]));

    const simEdges = visibleEdges
      .map((e) => ({
        source: simNodeById[e.source],
        target: simNodeById[e.target],
      }))
      .filter((e) => e.source && e.target);

    // ── SVG setup ──────────────────────────────────────────────────────────────
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "mg-glow");
    glow.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "blur");
    const fm = glow.append("feMerge");
    fm.append("feMergeNode").attr("in", "blur");
    fm.append("feMergeNode").attr("in", "SourceGraphic");

    const g = svg.append("g");

    // ── Zoom behaviour (shared between canvas and SVG) ─────────────────────────
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 6])
      .on("zoom", (e) => {
        transformRef.current = e.transform;
        g.attr("transform", e.transform);
        // Update zoom level for label tier visibility (debounced via requestAnimationFrame)
        setZoomLevel(e.transform.k);
        // Redraw canvas edges with new transform
        drawEdges(ctx, simEdges, e.transform, width, height);
      });

    svg.call(zoom);
    svg.on("click.deselect", () => onNodeClick(null));

    // ── Node rendering in SVG ──────────────────────────────────────────────────
    const nodeSel = g
      .append("g")
      .selectAll("g.nd")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "nd")
      .attr("data-nid", (d) => d.id)
      .style("cursor", "pointer");

    // Main circle
    nodeSel
      .append("circle")
      .attr("r", (d) => nodeRadius(normCentrality, d.id))
      .attr("fill", (d) => communityColor(communities[d.id] ?? 0))
      .attr("stroke", "#0D0F14")
      .attr("stroke-width", 1.5)
      .attr("filter", "url(#mg-glow)");

    // Tier 1 + Tier 2 labels (Tier 3 via tooltip only)
    nodeSel
      .filter((d) => getLabelTier(normCentrality[d.id] || 0) <= 2)
      .append("text")
      .attr("class", (d) =>
        getLabelTier(normCentrality[d.id] || 0) === 1 ? "label-tier1" : "label-tier2"
      )
      .text((d) =>
        d.title.length > 24 ? d.title.slice(0, 22) + "…" : d.title
      )
      .attr("x", (d) => nodeRadius(normCentrality, d.id) + 3)
      .attr("y", 4)
      .attr("font-size", (d) =>
        getLabelTier(normCentrality[d.id] || 0) === 1 ? "12px" : "10px"
      )
      .attr("font-family", "Georgia, serif")
      .attr("fill", (d) =>
        getLabelTier(normCentrality[d.id] || 0) === 1 ? "#C8CEDD" : "#8898B8"
      )
      .attr("pointer-events", "none");

    // ── Drag behaviour ─────────────────────────────────────────────────────────
    let dragging = false;
    const drag = d3
      .drag()
      .on("start", (event, d) => {
        dragging = false;
        if (!event.active) simRef.current?.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        dragging = true;
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simRef.current?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);

    nodeSel
      .on("click", function (event, d) {
        event.stopPropagation();
        if (dragging) { dragging = false; return; }
        onNodeClick(d.id === selectedId ? null : d.id);
      })
      .on("mouseenter", function (event, d) {
        const [mx, my] = d3.pointer(event, containerRef.current);
        setTooltip({ x: mx, y: my, title: d.title, domain: d.mathDomain });
      })
      .on("mouseleave", () => setTooltip(null));

    // ── D3 force simulation ────────────────────────────────────────────────────
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink(simEdges)
          .id((d) => d.id)
          .distance(85)
          .strength(0.28)
      )
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d) => nodeRadius(normCentrality, d.id) + 5)
      )
      .alphaDecay(0.018);

    simRef.current = simulation;

    // ── Tick handler: canvas edges + SVG node positions ────────────────────────
    simulation.on("tick", () => {
      drawEdges(ctx, simEdges, transformRef.current, width, height);
      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
      simRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, nodes, edges, communities, normCentrality, visibleNodeIds]);

  // ── Selection highlight (separate effect — no simulation restart) ─────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    if (!selectedId) {
      svg.selectAll(".nd circle").attr("opacity", 1);
      svg.selectAll(".nd text").attr("opacity", 1);
      return;
    }

    const connected = new Set([selectedId]);
    edges.forEach(({ source, target }) => {
      if (source === selectedId) connected.add(target);
      if (target === selectedId) connected.add(source);
    });

    svg.selectAll(".nd").each(function () {
      const nid = this.getAttribute("data-nid");
      const active = connected.has(nid);
      d3.select(this).selectAll("circle").attr("opacity", active ? 1 : 0.07);
      d3.select(this).select("text").attr("opacity", active ? 1 : 0.07);
    });
  }, [selectedId, edges]);

  // ── Tier 2 label visibility based on zoom level ───────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg
      .selectAll(".label-tier2")
      .attr("opacity", zoomLevel >= 1.4 ? 1 : 0);
  }, [zoomLevel]);

  // ── Community legend ──────────────────────────────────────────────────────────
  const uniqueCommunities = [...new Set(Object.values(communities))].sort(
    (a, b) => a - b
  );

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0D0F14" }}
    >
      {/* Canvas for edges (underneath) */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      />

      {/* SVG for nodes, labels, interactions (on top) */}
      <svg
        ref={svgRef}
        style={{ position: "absolute", top: 0, left: 0, display: "block" }}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            background: "#0F1119",
            border: "1px solid #2E3448",
            borderRadius: 4,
            padding: "5px 9px",
            pointerEvents: "none",
            zIndex: 20,
            fontFamily: "Georgia, serif",
          }}
        >
          <div style={{ fontSize: 12, color: "#E8EAF0" }}>{tooltip.title}</div>
          {tooltip.domain && (
            <div style={{ fontSize: 9, color: "#4A5470", marginTop: 2 }}>{tooltip.domain}</div>
          )}
        </div>
      )}

      {/* Community legend (bottom-left, scrollable) */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          background: "#0D0F14E8",
          border: "1px solid #1E2330",
          borderRadius: 6,
          padding: "10px 14px",
          maxWidth: 200,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: "#3A4460",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 7,
          }}
        >
          Communities
        </div>
        {uniqueCommunities.map((c) => (
          <div
            key={c}
            style={{ display: "flex", alignItems: "flex-start", gap: 7, marginBottom: 5 }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: communityColor(c),
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "#7888A8",
                lineHeight: 1.4,
              }}
            >
              {communityLabels?.[c]?.label || `Cluster ${c}`}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontSize: 9, color: "#2A3450", lineHeight: 1.6 }}>
          Size = centrality · Zoom for labels
        </div>
      </div>
    </div>
  );
}

// ── Canvas edge drawing ────────────────────────────────────────────────────────
function drawEdges(ctx, edges, transform, width, height) {
  ctx.clearRect(0, 0, width, height);

  const { x: tx, y: ty, k } = transform;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, tx, ty);

  ctx.beginPath();
  ctx.strokeStyle = "#3A4468";
  ctx.lineWidth = 1 / k; // keep visual weight constant regardless of zoom
  ctx.globalAlpha = 0.4;

  for (const edge of edges) {
    const s = edge.source;
    const t = edge.target;
    if (!s || !t || s.x === undefined || t.x === undefined) continue;
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
  }

  ctx.stroke();
  ctx.restore();
}
