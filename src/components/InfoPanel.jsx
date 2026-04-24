import { useState } from "react";
import { getDomainBreakdown } from "../utils/graphFilters.js";

const COMMUNITY_COLORS = [
  "#78B4D4", "#D4A878", "#A878D4", "#78D4A8",
  "#D47878", "#D4D478", "#78D4D4", "#D478A8",
  "#88B478", "#B49878", "#A8B4D4", "#D4B8A8",
  "#78A8D4", "#D478D4", "#A8D478",
];

function communityColor(c) {
  return COMMUNITY_COLORS[c % COMMUNITY_COLORS.length];
}

const S = {
  panel: {
    width: 340,
    borderLeft: "1px solid #1E2330",
    background: "#0F1119",
    padding: "18px 16px",
    overflowY: "auto",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    fontFamily: "Georgia, serif",
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  heading: {
    fontSize: 10,
    color: "#4A5470",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    borderBottom: "1px solid #1A1E2A",
    paddingBottom: 6,
  },
  communityCard: (c) => ({
    padding: "10px 11px",
    borderRadius: 5,
    background: "#0C0E15",
    borderLeft: `3px solid ${communityColor(c)}`,
  }),
  communityLabel: (c) => ({
    fontSize: 12,
    fontWeight: "bold",
    color: communityColor(c),
    marginBottom: 4,
  }),
  communityExpl: {
    fontSize: 11,
    color: "#6878A0",
    lineHeight: 1.7,
  },
  bridgeCard: {
    padding: "10px 11px",
    borderRadius: 5,
    background: "#0C0E15",
    border: "1px solid #2A3050",
  },
  bridgeTitle: { fontSize: 12, color: "#CDD0E5", fontWeight: "bold", marginBottom: 4 },
  bridgeExpl: { fontSize: 11, color: "#6878A0", lineHeight: 1.7 },
  gapCard: {
    padding: "10px 11px",
    borderRadius: 5,
    background: "#0C0E15",
    border: "1px solid #1A1E2A",
  },
  gapSubfield: { fontSize: 12, color: "#A8C0D8", marginBottom: 3 },
  gapReason: { fontSize: 11, color: "#4A5878", lineHeight: 1.6 },
  nodeCard: {
    padding: "12px 13px",
    borderRadius: 6,
    background: "#0C0E15",
    border: "1px solid #2A3050",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  nodeTitle: { fontSize: 14, fontWeight: "bold", color: "#E8EAF0" },
  nodeMeta: { fontSize: 10, color: "#4A5878" },
  nodeExtract: { fontSize: 11, color: "#6878A0", lineHeight: 1.75 },
  wikiLink: {
    fontSize: 10,
    color: "#3A5070",
    textDecoration: "none",
    borderBottom: "1px solid #2A3848",
    alignSelf: "flex-start",
  },
  spinner: {
    fontSize: 11,
    color: "#5A6890",
    fontStyle: "italic",
    lineHeight: 1.7,
    padding: "10px 0",
  },
  domainBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  domainLabel: { fontSize: 10, color: "#7888A8", width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  domainBarTrack: { flex: 1, height: 3, background: "#1A1E2A", borderRadius: 2 },
};

export default function InfoPanel({
  selectedNode,
  edges,
  nodes,
  communities,
  normCentrality,
  insights,
  insightsLoading,
  insightsError,
}) {
  const [showAllConnections, setShowAllConnections] = useState(false);
  const nodeMap = Object.fromEntries((nodes || []).map((n) => [n.id, n]));

  const connectedIds = selectedNode
    ? new Set(
        edges
          .filter(
            (e) => e.source === selectedNode.id || e.target === selectedNode.id
          )
          .flatMap((e) => [e.source, e.target])
          .filter((id) => id !== selectedNode.id)
      )
    : null;

  const communityIndex = selectedNode ? communities[selectedNode.id] : null;
  const centralityPct = selectedNode
    ? Math.round((normCentrality[selectedNode.id] || 0) * 100)
    : null;

  const domainBreakdown = getDomainBreakdown(nodes || []);
  const maxDomainCount = domainBreakdown[0]?.[1] || 1;

  const connectionList = connectedIds ? [...connectedIds] : [];
  const SHOW_LIMIT = 12;
  const shownConnections = showAllConnections
    ? connectionList
    : connectionList.slice(0, SHOW_LIMIT);

  return (
    <div style={S.panel}>
      {/* Selected node detail */}
      {selectedNode && (
        <div style={S.section}>
          <div style={S.heading}>Selected</div>
          <div style={S.nodeCard}>
            <div style={S.nodeTitle}>{selectedNode.title}</div>
            <div style={S.nodeMeta}>
              {selectedNode.mathDomain && (
                <span
                  style={{
                    display: "inline-block",
                    background: "#1A1E2A",
                    borderRadius: 3,
                    padding: "1px 6px",
                    marginRight: 6,
                    color: "#78B4D4",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                  }}
                >
                  {selectedNode.mathDomain}
                </span>
              )}
              Community {communityIndex} · Centrality {centralityPct}%
            </div>
            {selectedNode.categories?.length > 0 && (
              <div style={{ ...S.nodeMeta, fontStyle: "italic" }}>
                {selectedNode.categories.slice(0, 3).join(" · ")}
              </div>
            )}
            {selectedNode.extract && (
              <div style={S.nodeExtract}>
                {selectedNode.extract.slice(0, 300)}
                {selectedNode.extract.length > 300 ? "…" : ""}
              </div>
            )}
            <a
              href={selectedNode.url}
              target="_blank"
              rel="noopener noreferrer"
              style={S.wikiLink}
            >
              Read on Wikipedia ↗
            </a>
          </div>

          {connectedIds && connectedIds.size > 0 && (
            <div>
              <div style={{ ...S.nodeMeta, marginBottom: 6 }}>
                {connectedIds.size} connection{connectedIds.size !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {shownConnections.map((id) => {
                  const n = nodeMap[id];
                  if (!n) return null;
                  const c = communities[id];
                  return (
                    <div
                      key={id}
                      style={{
                        fontSize: 11,
                        color: "#7888A8",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: communityColor(c ?? 0),
                          flexShrink: 0,
                        }}
                      />
                      {n.title}
                    </div>
                  );
                })}
                {connectionList.length > SHOW_LIMIT && !showAllConnections && (
                  <button
                    onClick={() => setShowAllConnections(true)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 10,
                      color: "#3A5070",
                      textAlign: "left",
                      padding: 0,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    +{connectionList.length - SHOW_LIMIT} more…
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Claude annotations */}
      {insightsLoading && (
        <div style={S.spinner}>Asking Claude to annotate community structure…</div>
      )}

      {insightsError && (
        <div
          style={{
            fontSize: 11,
            color: "#E07070",
            background: "#1A0E0E",
            border: "1px solid #E0707030",
            borderRadius: 5,
            padding: "10px 12px",
            lineHeight: 1.6,
          }}
        >
          Claude error: {insightsError}
        </div>
      )}

      {insights && (
        <>
          {/* Communities */}
          <div style={S.section}>
            <div style={S.heading}>Mathematical Communities</div>
            {Object.entries(insights.communities || {}).map(([c, info]) => (
              <div key={c} style={S.communityCard(Number(c))}>
                <div style={S.communityLabel(Number(c))}>{info.label}</div>
                <div style={S.communityExpl}>{info.explanation}</div>
              </div>
            ))}
          </div>

          {/* Bridges */}
          {insights.bridges?.length > 0 && (
            <div style={S.section}>
              <div style={S.heading}>Bridge Concepts</div>
              {insights.bridges.map((b, i) => (
                <div key={i} style={S.bridgeCard}>
                  <div style={S.bridgeTitle}>{b.title}</div>
                  <div style={S.bridgeExpl}>{b.explanation}</div>
                </div>
              ))}
            </div>
          )}

          {/* Structural gaps */}
          {insights.gaps?.length > 0 && (
            <div style={S.section}>
              <div style={S.heading}>Structural Gaps</div>
              <div
                style={{
                  fontSize: 10,
                  color: "#3A4460",
                  marginBottom: 2,
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }}
              >
                Subfields absent or underrepresented in this crawl.
              </div>
              {insights.gaps.map((g, i) => (
                <div key={i} style={S.gapCard}>
                  <div style={S.gapSubfield}>{g.subfield}</div>
                  <div style={S.gapReason}>{g.reason}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Domain breakdown (always shown) */}
      {nodes?.length > 0 && (
        <div style={S.section}>
          <div style={S.heading}>Domain Breakdown</div>
          {domainBreakdown.slice(0, 12).map(([domain, count]) => (
            <div key={domain} style={S.domainBar}>
              <span style={S.domainLabel} title={domain}>
                {domain}
              </span>
              <div style={S.domainBarTrack}>
                <div
                  style={{
                    height: "100%",
                    width: `${(count / maxDomainCount) * 100}%`,
                    background: "#78B4D4",
                    borderRadius: 2,
                    opacity: 0.6,
                  }}
                />
              </div>
              <span style={{ fontSize: 9, color: "#3A4460", flexShrink: 0, width: 20, textAlign: "right" }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
