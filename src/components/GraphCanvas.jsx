import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { computeRadialInitialPositions, domainColor } from "../utils/graphFilters.js";

function nodeRadius(normCentrality, nodeId) {
  return 5 + (normCentrality[nodeId] || 0) * 12;
}

function getLabelTier(v) {
  if (v >= 0.65) return 1;
  if (v >= 0.3) return 2;
  return 3;
}

function hitTest(offsetX, offsetY, simNodes, transform, normCentrality) {
  const [wx, wy] = transform.invert([offsetX, offsetY]);
  for (let i = simNodes.length - 1; i >= 0; i--) {
    const n = simNodes[i];
    if (n.x === undefined) continue;
    const r = nodeRadius(normCentrality, n.id);
    const dx = wx - n.x;
    const dy = wy - n.y;
    if (dx * dx + dy * dy <= r * r) return n;
  }
  return null;
}

function drawFrame(ctx, simNodes, simEdges, transform, normCentrality, selectedId) {
  const { width, height } = ctx.canvas;
  const { x: tx, y: ty, k } = transform;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.setTransform(k, 0, 0, k, tx, ty);

  const connected = new Set();
  if (selectedId) {
    connected.add(selectedId);
    for (const { source: s, target: t } of simEdges) {
      const sid = s?.id ?? s;
      const tid = t?.id ?? t;
      if (sid === selectedId) connected.add(tid);
      if (tid === selectedId) connected.add(sid);
    }
  }

  // ── Edges ──────────────────────────────────────────────────────────────────
  const lw = 1 / k;
  if (selectedId) {
    ctx.beginPath();
    ctx.strokeStyle = "#3A4468";
    ctx.lineWidth = lw;
    ctx.globalAlpha = 0.05;
    for (const { source: s, target: t } of simEdges) {
      if (!s?.x || !t?.x) continue;
      if (!connected.has(s.id) || !connected.has(t.id)) {
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
      }
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "#6888A8";
    ctx.lineWidth = 1.5 / k;
    ctx.globalAlpha = 0.65;
    for (const { source: s, target: t } of simEdges) {
      if (!s?.x || !t?.x) continue;
      if (connected.has(s.id) && connected.has(t.id)) {
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
      }
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.strokeStyle = "#3A4468";
    ctx.lineWidth = lw;
    ctx.globalAlpha = 0.4;
    for (const { source: s, target: t } of simEdges) {
      if (!s?.x || !t?.x) continue;
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
    }
    ctx.stroke();
  }

  // ── Node fills — batched by (color, alpha) ─────────────────────────────────
  const colorGroups = {};
  for (const node of simNodes) {
    if (node.x === undefined) continue;
    const active = !selectedId || connected.has(node.id);
    const alpha = active ? 1 : 0.07;
    const color = domainColor(node.mathDomain);
    const key = `${alpha}_${color}`;
    if (!colorGroups[key]) colorGroups[key] = { alpha, color, nodes: [] };
    colorGroups[key].nodes.push(node);
  }

  for (const { alpha, color, nodes: group } of Object.values(colorGroups)) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const node of group) {
      const r = nodeRadius(normCentrality, node.id);
      ctx.moveTo(node.x + r, node.y);
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // ── Node outlines ─────────────────────────────────────────────────────────
  ctx.strokeStyle = "#0D0F14";
  ctx.lineWidth = 1.5 / k;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const node of simNodes) {
    if (node.x === undefined) continue;
    if (selectedId && !connected.has(node.id)) continue;
    const r = nodeRadius(normCentrality, node.id);
    ctx.moveTo(node.x + r, node.y);
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  }
  ctx.stroke();

  // ── Labels — tier 1 always, tier 2 at zoom ≥ 1.4 ─────────────────────────
  ctx.textBaseline = "middle";
  for (const node of simNodes) {
    if (node.x === undefined) continue;
    const nc = normCentrality[node.id] || 0;
    const tier = getLabelTier(nc);
    if (tier === 3) continue;
    if (tier === 2 && k < 1.4) continue;
    const active = !selectedId || connected.has(node.id);
    ctx.globalAlpha = active ? 1 : 0.07;
    const r = nodeRadius(normCentrality, node.id);
    const label = node.title.length > 24 ? node.title.slice(0, 22) + "…" : node.title;
    ctx.font = `${tier === 1 ? 12 : 10}px Georgia, serif`;
    ctx.fillStyle = tier === 1 ? "#C8CEDD" : "#8898B8";
    ctx.fillText(label, node.x + r + 3, node.y);
  }

  ctx.restore();
}

export default function GraphCanvas({
  nodes,
  edges,
  normCentrality,
  visibleNodeIds,
  onNodeClick,
  selectedId,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const transformRef = useRef(d3.zoomIdentity);
  const simNodesRef = useRef([]);
  const simEdgesRef = useRef([]);
  const dragNodeRef = useRef(null);
  const isDraggingRef = useRef(false);

  const normCentralityRef = useRef(normCentrality);
  const selectedIdRef = useRef(selectedId);
  const onNodeClickRef = useRef(onNodeClick);
  useEffect(() => { normCentralityRef.current = normCentrality; }, [normCentrality]);
  useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

  const [dims, setDims] = useState({ width: 900, height: 650 });
  const [tooltip, setTooltip] = useState(null);

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

  useEffect(() => {
    selectedIdRef.current = selectedId;
    const canvas = canvasRef.current;
    if (!canvas || !simNodesRef.current.length) return;
    drawFrame(
      canvas.getContext("2d"),
      simNodesRef.current,
      simEdgesRef.current,
      transformRef.current,
      normCentrality,
      selectedId
    );
  }, [selectedId, normCentrality]);

  // ── Main effect: simulation + zoom + interaction ───────────────────────────
  useEffect(() => {
    if (!canvasRef.current || nodes.length === 0) return;

    const { width, height } = dims;
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const visibleNodes = visibleNodeIds
      ? nodes.filter((n) => visibleNodeIds.has(n.id))
      : nodes;
    const visibleEdges = visibleNodeIds
      ? edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
      : edges;

    const initialPositions = computeRadialInitialPositions(visibleNodes, width, height);

    const prevById = Object.fromEntries(simNodesRef.current.map((n) => [n.id, n]));
    const simNodes = visibleNodes.map((n) => {
      const prev = prevById[n.id];
      return {
        ...n,
        x: prev?.x ?? initialPositions[n.id]?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: prev?.y ?? initialPositions[n.id]?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
      };
    });
    const simNodeById = Object.fromEntries(simNodes.map((n) => [n.id, n]));
    const simEdges = visibleEdges
      .map((e) => ({ source: simNodeById[e.source], target: simNodeById[e.target] }))
      .filter((e) => e.source && e.target);

    simNodesRef.current = simNodes;
    simEdgesRef.current = simEdges;

    const zoom = d3.zoom()
      .scaleExtent([0.1, 6])
      .filter((event) => {
        if (event.type === "mousedown") {
          const hit = hitTest(event.offsetX, event.offsetY, simNodesRef.current, transformRef.current, normCentralityRef.current);
          return !hit;
        }
        return !event.button;
      })
      .on("zoom", (e) => {
        transformRef.current = e.transform;
        drawFrame(ctx, simNodesRef.current, simEdgesRef.current, e.transform, normCentralityRef.current, selectedIdRef.current);
      });

    d3.select(canvas).call(zoom);

    const simulation = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink(simEdges).id((d) => d.id).distance(85).strength(0.28))
      .force("charge", d3.forceManyBody().strength(-160).theta(1.0))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d) => nodeRadius(normCentralityRef.current, d.id) + 5).iterations(1))
      .alphaDecay(0.025)
      .velocityDecay(0.4);

    simRef.current = simulation;

    simulation.on("tick", () => {
      drawFrame(ctx, simNodes, simEdges, transformRef.current, normCentralityRef.current, selectedIdRef.current);
    });

    let mouseDownPos = null;

    const onMouseDown = (event) => {
      if (event.button !== 0) return;
      mouseDownPos = { x: event.offsetX, y: event.offsetY };
      const hit = hitTest(event.offsetX, event.offsetY, simNodesRef.current, transformRef.current, normCentralityRef.current);
      if (!hit) return;
      dragNodeRef.current = hit;
      isDraggingRef.current = false;
      hit.fx = hit.x;
      hit.fy = hit.y;
      simRef.current?.alphaTarget(0.2).restart();
    };

    const onMouseMove = (event) => {
      if (dragNodeRef.current) {
        isDraggingRef.current = true;
        const [wx, wy] = transformRef.current.invert([event.offsetX, event.offsetY]);
        dragNodeRef.current.fx = wx;
        dragNodeRef.current.fy = wy;
        canvas.style.cursor = "grabbing";
        return;
      }
      const hit = hitTest(event.offsetX, event.offsetY, simNodesRef.current, transformRef.current, normCentralityRef.current);
      canvas.style.cursor = hit ? "pointer" : "default";
      if (hit) {
        setTooltip({ x: event.offsetX, y: event.offsetY, title: hit.title, domain: hit.mathDomain });
      } else {
        setTooltip(null);
      }
    };

    const onMouseUp = (event) => {
      if (dragNodeRef.current) {
        if (!isDraggingRef.current) {
          const id = dragNodeRef.current.id;
          onNodeClickRef.current(id === selectedIdRef.current ? null : id);
        }
        dragNodeRef.current.fx = null;
        dragNodeRef.current.fy = null;
        simRef.current?.alphaTarget(0);
        dragNodeRef.current = null;
        isDraggingRef.current = false;
        canvas.style.cursor = "default";
      } else if (mouseDownPos) {
        const dx = event.offsetX - mouseDownPos.x;
        const dy = event.offsetY - mouseDownPos.y;
        if (dx * dx + dy * dy < 25) onNodeClickRef.current(null);
      }
      mouseDownPos = null;
    };

    const onMouseLeave = () => {
      setTooltip(null);
      canvas.style.cursor = "default";
      if (dragNodeRef.current) {
        dragNodeRef.current.fx = null;
        dragNodeRef.current.fy = null;
        simRef.current?.alphaTarget(0);
        dragNodeRef.current = null;
        isDraggingRef.current = false;
      }
      mouseDownPos = null;
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseLeave);

    return () => {
      simulation.stop();
      simRef.current = null;
      d3.select(canvas).on(".zoom", null);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims, nodes, edges, normCentrality, visibleNodeIds]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: "relative", overflow: "hidden", background: "#0D0F14" }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, display: "block" }}
      />

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

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          background: "#0D0F14E8",
          border: "1px solid #1E2330",
          borderRadius: 6,
          padding: "8px 12px",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 9, color: "#2A3450", lineHeight: 1.6, fontFamily: "Georgia, serif" }}>
          Color = domain · Size = centrality · Zoom for labels
        </div>
      </div>
    </div>
  );
}
