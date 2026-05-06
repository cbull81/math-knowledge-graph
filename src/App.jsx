import { useState, useEffect, useMemo } from "react";
import GraphCanvas from "./components/GraphCanvas.jsx";
import InfoPanel from "./components/InfoPanel.jsx";
import ControlBar from "./components/ControlBar.jsx";
import { computeBetweenness, detectCommunities, normalise } from "./utils/graphAnalysis.js";
import { analyseGraph } from "./services/claudeService.js";
import { applyFilters, getNeighbourIds } from "./utils/graphFilters.js";

const FONT = "Georgia, serif";

function LoadingScreen({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0D0F14",
        fontFamily: FONT,
        gap: 16,
      }}
    >
      <div
        style={{
          width: 280,
          background: "#0F1119",
          border: "1px solid #1E2330",
          borderRadius: 8,
          padding: "28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 13, color: "#78B4D4", letterSpacing: "0.05em" }}>
          Mathematics Knowledge Graph
        </div>
        <div style={{ fontSize: 11, color: "#6878A0" }}>{message}</div>
        <div
          style={{
            height: 2,
            background: "#1A1E2A",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "60%",
              background: "#78B4D4",
              borderRadius: 1,
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`
          @keyframes pulse {
            0%   { opacity: 0.3; transform: translateX(-100%); }
            50%  { opacity: 1; }
            100% { opacity: 0.3; transform: translateX(250%); }
          }
        `}</style>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0D0F14",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          maxWidth: 400,
          background: "#0F1119",
          border: "1px solid #3A1A1A",
          borderRadius: 8,
          padding: "24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: "#D47878" }}>Failed to load graph data</div>
        <div style={{ fontSize: 11, color: "#6878A0", lineHeight: 1.7 }}>{message}</div>
        <div style={{ fontSize: 10, color: "#3A4460", fontStyle: "italic", lineHeight: 1.6 }}>
          Run <code style={{ background: "#1A1E2A", padding: "1px 5px", borderRadius: 3 }}>npm run crawl</code> to generate the graph data, then restart the dev server.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState("loading"); // 'loading' | 'ready' | 'error'
  const [loadMessage, setLoadMessage] = useState("Loading graph data…");
  const [loadError, setLoadError] = useState(null);

  // Core graph data
  const [graphData, setGraphData] = useState(null); // { nodes, edges, meta }
  const [analysis, setAnalysis] = useState(null);   // { communities, centrality, normCentrality }

  // Claude insights
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  // UI state
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
    searchQuery: "",
    communityFilter: null,
    minCentrality: 0,
  });

  // ── Load and analyse graph on mount ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadMessage("Loading graph data…");
        const res = await fetch("./math_graph.json");
        if (!res.ok) throw new Error(`HTTP ${res.status} — have you run npm run crawl?`);
        const data = await res.json();

        if (cancelled) return;

        if (!data.nodes?.length || !data.edges?.length) {
          throw new Error("Graph data is empty. Re-run the crawler.");
        }

        setLoadMessage("Detecting communities…");
        // Yield to allow the UI to update the message
        await new Promise((r) => setTimeout(r, 20));

        const communities = detectCommunities(data.nodes, data.edges);
        const centrality = computeBetweenness(data.nodes, data.edges);
        const normCentrality = normalise(centrality);

        if (cancelled) return;

        setGraphData(data);
        setAnalysis({ communities, centrality, normCentrality });
        setPhase("ready");

        // ── Claude annotation (non-blocking) ──────────────────────────────────
        setInsightsLoading(true);
        setInsightsError(null);
        analyseGraph({
          nodes: data.nodes,
          edges: data.edges,
          communities,
          centrality,
        })
          .then((result) => {
            if (!cancelled) {
              setInsights(result);
              setInsightsLoading(false);
            }
          })
          .catch((err) => {
            if (!cancelled) {
              setInsightsError(err.message);
              setInsightsLoading(false);
            }
          });
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message);
          setPhase("error");
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Derived: visible nodes/edges after filtering ──────────────────────────────
  const visibleNodeIds = useMemo(() => {
    if (!graphData || !analysis) return null;

    const hasActiveFilters =
      filters.searchQuery ||
      filters.communityFilter !== null ||
      filters.minCentrality > 0;

    // No active filters → show all nodes; return null so the simulation doesn't
    // restart when selectedId changes (null === null is a stable reference).
    if (!hasActiveFilters) return null;

    const filtered = applyFilters(
      graphData.nodes,
      analysis.normCentrality,
      analysis.communities,
      filters
    );

    // When a node is selected, expand the visible set to include its full
    // neighborhood so the user can see how it connects even to filtered-out nodes.
    if (selectedId) {
      for (const id of getNeighbourIds(selectedId, graphData.edges)) {
        filtered.add(id);
      }
    }

    return filtered;
  }, [graphData, analysis, filters, selectedId]);

  // ── Derived: selected node object ────────────────────────────────────────────
  const selectedNode = useMemo(() => {
    if (!selectedId || !graphData) return null;
    return graphData.nodes.find((n) => n.id === selectedId) || null;
  }, [selectedId, graphData]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (phase === "loading") return <LoadingScreen message={loadMessage} />;
  if (phase === "error") return <ErrorScreen message={loadError} />;

  const communityLabels = insights?.communities || null;
  const visibleCount = visibleNodeIds ? visibleNodeIds.size : graphData.nodes.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0D0F14",
        fontFamily: FONT,
        color: "#C8CEDD",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid #1E2330",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: "bold",
              color: "#E8EAF0",
              letterSpacing: "0.06em",
            }}
          >
            Mathematics Knowledge Graph
          </span>
          {graphData && (
            <span
              style={{
                fontSize: 10,
                color: "#4A5470",
                marginLeft: 14,
                fontStyle: "italic",
              }}
            >
              {graphData.meta.nodeCount} articles · {graphData.meta.edgeCount} links ·{" "}
              {[...new Set(Object.values(analysis.communities))].length} communities
              {graphData.meta.crawledAt && (
                <> · crawled {new Date(graphData.meta.crawledAt).toLocaleDateString()}</>
              )}
            </span>
          )}
        </div>
        <a
          href="https://en.wikipedia.org/wiki/Portal:Mathematics"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10,
            color: "#3A5070",
            textDecoration: "none",
            borderBottom: "1px solid #2A3848",
            fontFamily: FONT,
          }}
        >
          Wikipedia Mathematics Portal ↗
        </a>
      </div>

      {/* Filter controls */}
      <ControlBar
        communities={analysis.communities}
        communityLabels={communityLabels}
        normCentrality={analysis.normCentrality}
        filters={filters}
        onFiltersChange={setFilters}
        totalNodes={graphData.nodes.length}
        visibleCount={visibleCount}
      />

      {/* Body: graph + panel */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <GraphCanvas
          nodes={graphData.nodes}
          edges={graphData.edges}
          communities={analysis.communities}
          normCentrality={analysis.normCentrality}
          communityLabels={communityLabels}
          visibleNodeIds={visibleNodeIds}
          onNodeClick={setSelectedId}
          selectedId={selectedId}
        />
        <InfoPanel
          selectedNode={selectedNode}
          edges={graphData.edges}
          nodes={graphData.nodes}
          communities={analysis.communities}
          normCentrality={analysis.normCentrality}
          communityLabels={communityLabels}
          insights={insights}
          insightsLoading={insightsLoading}
          insightsError={insightsError}
          onNodeClick={setSelectedId}
        />
      </div>
    </div>
  );
}
