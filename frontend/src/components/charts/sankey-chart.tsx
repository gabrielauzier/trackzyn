import { useEffect, useMemo, useRef, useState } from 'react'
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  sankeyJustify,
  type SankeyLink,
  type SankeyNode,
} from 'd3-sankey'
import { SERIES_COLORS, defaultFormatter } from './chart-theme'
import { type ValueFormatter } from './chart-types'

export interface SankeyNodeInput {
  id: string
  label: string
  color?: string
}

export interface SankeyLinkInput {
  source: string
  target: string
  value: number
}

export interface SankeyChartProps {
  nodes: SankeyNodeInput[]
  links: SankeyLinkInput[]
  height?: number
  valueFormatter?: ValueFormatter
}

type NodeDatum = SankeyNodeInput & { color: string }
type LinkDatum = { value: number }
type LaidNode = SankeyNode<NodeDatum, LinkDatum>
type LaidLink = SankeyLink<NodeDatum, LinkDatum>

const NODE_WIDTH = 12
const NODE_PADDING = 18
const LABEL_GAP = 8

/**
 * Flows between stages: where volume comes from and where it goes.
 * Hovering a node or a link isolates its flows; everything else fades.
 * Labels point towards the centre: right of nodes in the left half, left
 * of nodes in the right half.
 */
export function SankeyChart({ nodes, links, height = 320, valueFormatter = defaultFormatter }: SankeyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ node?: number; link?: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    if (width <= 0 || nodes.length === 0) return null
    const index = new Map(nodes.map((n, i) => [n.id, i]))
    const generator = d3Sankey<NodeDatum, LinkDatum>()
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .extent([
        [0, 4],
        [width, height - 4],
      ])
    return generator({
      nodes: nodes.map((n, i) => ({ ...n, color: n.color ?? SERIES_COLORS[i % SERIES_COLORS.length] })),
      links: links
        .filter((l) => index.has(l.source) && index.has(l.target) && l.value > 0)
        .map((l) => ({ source: index.get(l.source)!, target: index.get(l.target)!, value: l.value })),
    })
  }, [nodes, links, width, height])

  const linkPath = sankeyLinkHorizontal<NodeDatum, LinkDatum>()

  const isLinkActive = (link: LaidLink, i: number) => {
    if (!hover) return true
    if (hover.link !== undefined) return hover.link === i
    const src = (link.source as LaidNode).index
    const tgt = (link.target as LaidNode).index
    return src === hover.node || tgt === hover.node
  }
  const isNodeActive = (node: LaidNode) => {
    if (!hover || !layout) return true
    if (hover.node !== undefined) {
      if (node.index === hover.node) return true
      return layout.links.some(
        (l) =>
          ((l.source as LaidNode).index === hover.node && (l.target as LaidNode).index === node.index) ||
          ((l.target as LaidNode).index === hover.node && (l.source as LaidNode).index === node.index),
      )
    }
    const link = layout.links[hover.link!]
    return (link.source as LaidNode).index === node.index || (link.target as LaidNode).index === node.index
  }

  const hoveredLink = hover?.link !== undefined && layout ? layout.links[hover.link] : null

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      {layout && (
        <svg width={width} height={height} role="img" aria-label="Flow diagram" className="overflow-visible">
          <defs>
            {layout.links.map((link, i) => (
              <linearGradient
                key={i}
                id={`sankey-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={(link.source as LaidNode).x1}
                x2={(link.target as LaidNode).x0}
              >
                <stop offset="0%" stopColor={(link.source as LaidNode).color} />
                <stop offset="100%" stopColor={(link.target as LaidNode).color} />
              </linearGradient>
            ))}
          </defs>
          <g fill="none">
            {layout.links.map((link, i) => (
              <path
                key={i}
                d={linkPath(link) ?? undefined}
                stroke={`url(#sankey-grad-${i})`}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={isLinkActive(link, i) ? 0.45 : 0.08}
                className="transition-[stroke-opacity] duration-150"
                onMouseEnter={() => setHover({ link: i })}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </g>
          {layout.nodes.map((node) => {
            // Nodes in the right half label towards the centre, so the
            // last column never pushes its text past the edge.
            const labelLeft = node.x0! > width / 2
            const x = labelLeft ? node.x0! - LABEL_GAP : node.x1! + LABEL_GAP
            const y = (node.y0! + node.y1!) / 2
            const active = isNodeActive(node)
            return (
              <g
                key={node.id}
                onMouseEnter={() => setHover({ node: node.index })}
                onMouseLeave={() => setHover(null)}
                opacity={active ? 1 : 0.35}
                className="transition-opacity duration-150"
              >
                <rect
                  x={node.x0}
                  y={node.y0}
                  width={node.x1! - node.x0!}
                  height={Math.max(1, node.y1! - node.y0!)}
                  rx={3}
                  fill={node.color}
                />
                <text
                  x={x}
                  y={y}
                  dy="-0.15em"
                  textAnchor={labelLeft ? 'end' : 'start'}
                  className="fill-foreground text-[11px] font-medium"
                >
                  {node.label}
                </text>
                <text
                  x={x}
                  y={y}
                  dy="1.05em"
                  textAnchor={labelLeft ? 'end' : 'start'}
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {valueFormatter(node.value ?? 0)}
                </text>
              </g>
            )
          })}
        </svg>
      )}
      {hoveredLink && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md">
          {(hoveredLink.source as LaidNode).label} → {(hoveredLink.target as LaidNode).label}:{' '}
          <span className="font-semibold tabular-nums">{valueFormatter(hoveredLink.value)}</span>
        </div>
      )}
    </div>
  )
}
