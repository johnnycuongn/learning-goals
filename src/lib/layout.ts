import type { Block, LayoutStage as Stage, View } from './types'

/**
 * Spec 4.2 fixes the canvas at 760 px tall. That was leaving roughly 45% of it
 * empty, and fit-to-height then shrank node text below the size acceptance
 * criterion 2 requires on a 390 px phone. `minHeight: 0` fits the canvas to its
 * content instead, so fit-to-height fills the screen and the tags stay legible.
 */
export interface Metrics {
  primaryW: number
  primaryMinH: number
  itemW1: number
  itemW2: number
  colGap: number
  rowGap: number
  blockGap: number
  /** Primary node edge to the first block. */
  branchGap: number
  stageGap: number
  noteGap: number
  groupPadX: number
  groupPadY: number
  groupTitleH: number
  startX: number
  endX: number
  padY: number
  minHeight: number
}

export const METRICS: Record<View, Metrics> = {
  topics: {
    primaryW: 216, primaryMinH: 56,
    itemW1: 200, itemW2: 152, colGap: 10, rowGap: 10, blockGap: 18,
    branchGap: 38, stageGap: 72, noteGap: 208,
    groupPadX: 12, groupPadY: 12, groupTitleH: 22,
    startX: 300, endX: 168, padY: 28, minHeight: 0,
  },
  resources: {
    primaryW: 216, primaryMinH: 56,
    itemW1: 248, itemW2: 176, colGap: 10, rowGap: 10, blockGap: 18,
    branchGap: 38, stageGap: 72, noteGap: 208,
    groupPadX: 12, groupPadY: 12, groupTitleH: 22,
    startX: 300, endX: 168, padY: 28, minHeight: 0,
  },
}

export interface PlacedNode {
  id: string
  kind: 'stage' | 'item'
  stageId: string
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedGroup {
  key: string
  title: string
  stageId: string
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedNote {
  key: string
  text: string
  x: number
  y: number
  w: number
}

export interface Connector {
  key: string
  d: string
  stageId: string
}

export interface Layout {
  width: number
  height: number
  spineY: number
  spineStart: number
  spineEnd: number
  nodes: PlacedNode[]
  groups: PlacedGroup[]
  notes: PlacedNote[]
  connectors: Connector[]
  /** Spine x of each stage, for the mini-map and for scroll-to. */
  stageX: { id: string; x: number; left: number; right: number }[]
  byId: Map<string, PlacedNode>
}

/** Width of a block's content box, not counting group padding. */
function contentWidth(block: Block, m: Metrics): number {
  return block.cols === 2 ? m.itemW2 * 2 + m.colGap : m.itemW1
}

function blockWidth(block: Block, m: Metrics): number {
  return contentWidth(block, m) + (block.group ? m.groupPadX * 2 : 0)
}

function itemWidth(block: Block, m: Metrics): number {
  return block.cols === 2 ? m.itemW2 : m.itemW1
}

/** Items split into rows of `cols`, nearest-the-spine row first. */
function rowsOf(block: Block): string[][] {
  const rows: string[][] = []
  for (let i = 0; i < block.items.length; i += block.cols) {
    rows.push(block.items.slice(i, i + block.cols))
  }
  return rows
}

type HeightOf = (id: string, width: number) => number

/**
 * Places every stage, item, group box, milestone note and connector on one
 * horizontal canvas. Pure: given the same measured heights it returns the same
 * geometry, so it can run on every resize without surprises.
 *
 * Spec 4.2. The spine runs left to right; a stage's blocks branch above and
 * below it, stacking away from the spine, with item[0] nearest the spine.
 */
export function computeLayout(
  stages: Stage[],
  view: View,
  heightOf: HeightOf,
  metricsOverride?: Partial<Metrics>,
): Layout {
  const m = { ...METRICS[view], ...metricsOverride }

  const nodes: PlacedNode[] = []
  const groups: PlacedGroup[] = []
  const notes: PlacedNote[] = []
  const connectors: Connector[] = []
  const stageX: Layout['stageX'] = []

  // Pass 1: everything relative to a spine at y = 0. Positive y is below it.
  let x = m.startX
  let noteAbove = true

  for (const stage of stages) {
    const allBlocks = [...stage.layout.above, ...stage.layout.below]
    const colW = Math.max(m.primaryW, ...allBlocks.map((b) => blockWidth(b, m)))
    const left = x
    const cx = x + colW / 2

    const primaryH = Math.max(m.primaryMinH, heightOf(stage.id, m.primaryW))
    const primaryTop = -primaryH / 2
    const primaryBottom = primaryH / 2

    nodes.push({
      id: stage.id,
      kind: 'stage',
      stageId: stage.id,
      x: cx - m.primaryW / 2,
      y: primaryTop,
      w: m.primaryW,
      h: primaryH,
    })

    for (const side of ['above', 'below'] as const) {
      const isAbove = side === 'above'
      const blocks = stage.layout[side]
      // Distance from the spine to the near edge of the block being placed.
      let cursor = (isAbove ? -primaryTop : primaryBottom) + m.branchGap

      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi]
        const rows = rowsOf(block)
        const iw = itemWidth(block, m)
        const rowHeights = rows.map((row) => Math.max(...row.map((id) => heightOf(id, iw))))
        const innerH = rowHeights.reduce((a, b) => a + b, 0) + m.rowGap * (rows.length - 1)
        const blockH = innerH + (block.group ? m.groupPadY * 2 + m.groupTitleH : 0)
        const bw = blockWidth(block, m)
        const bx = cx - bw / 2

        // `near` is the block edge facing the spine, as a signed canvas y.
        const near = isAbove ? -cursor : cursor
        const far = isAbove ? -(cursor + blockH) : cursor + blockH
        const top = Math.min(near, far)

        if (block.group) {
          groups.push({
            key: `${stage.id}-${side}-${bi}`,
            title: block.group,
            stageId: stage.id,
            x: bx,
            y: top,
            w: bw,
            h: blockH,
          })
        }

        // Rows fill outward from the spine, so item[0] is always closest to it.
        const innerNear = isAbove
          ? near - (block.group ? m.groupPadY : 0)
          : near + (block.group ? m.groupPadY + m.groupTitleH : 0)

        let rowCursor = 0
        for (let ri = 0; ri < rows.length; ri++) {
          const row = rows[ri]
          const rowH = rowHeights[ri]
          const rowTop = isAbove
            ? innerNear - rowCursor - rowH
            : innerNear + rowCursor
          const rowW = row.length * iw + (row.length - 1) * m.colGap
          const rowLeft = cx - rowW / 2
          row.forEach((id, ci) => {
            nodes.push({
              id,
              kind: 'item',
              stageId: stage.id,
              x: rowLeft + ci * (iw + m.colGap),
              y: rowTop,
              w: iw,
              h: heightOf(id, iw),
            })
          })
          rowCursor += rowH + m.rowGap
        }

        // Connectors: to the group box edge if grouped, otherwise to each item.
        const from = isAbove ? primaryTop : primaryBottom
        const targets: { x: number; y: number; key: string }[] = block.group
          ? [{ x: cx, y: near, key: `g-${stage.id}-${side}-${bi}` }]
          : block.items.map((id) => {
              const n = nodes.find((p) => p.id === id)!
              return { x: n.x + n.w / 2, y: isAbove ? n.y + n.h : n.y, key: `c-${id}` }
            })

        for (const t of targets) {
          const dy = t.y - from
          const k = Math.max(20, Math.abs(dy) * 0.45)
          const c1y = from + Math.sign(dy) * k
          const c2y = t.y - Math.sign(dy) * k
          connectors.push({
            key: t.key,
            stageId: stage.id,
            d: `M ${cx.toFixed(1)} ${from.toFixed(1)} C ${cx.toFixed(1)} ${c1y.toFixed(1)}, ${t.x.toFixed(1)} ${c2y.toFixed(1)}, ${t.x.toFixed(1)} ${t.y.toFixed(1)}`,
          })
        }

        cursor += blockH + m.blockGap
      }
    }

    stageX.push({ id: stage.id, x: cx, left, right: left + colW })

    const gap = stage.note ? m.noteGap : m.stageGap
    if (stage.note) {
      const noteW = gap - 32
      notes.push({
        key: `note-${stage.id}`,
        text: stage.note,
        x: left + colW + 16,
        // Clear of the primary node, in the gap, alternating sides.
        y: noteAbove ? -132 : 92,
        w: noteW,
      })
      noteAbove = !noteAbove
    }
    x = left + colW + gap
  }

  const spineEnd = x - m.stageGap + 96
  const width = spineEnd + m.endX

  // Pass 2: find the vertical extent, then drop the spine so it all fits.
  let top = -m.primaryMinH
  let bottom = m.primaryMinH
  for (const n of nodes) {
    top = Math.min(top, n.y)
    bottom = Math.max(bottom, n.y + n.h)
  }
  for (const g of groups) {
    top = Math.min(top, g.y)
    bottom = Math.max(bottom, g.y + g.h)
  }
  for (const n of notes) {
    top = Math.min(top, n.y)
    bottom = Math.max(bottom, n.y + 72)
  }

  const needed = bottom - top + m.padY * 2
  const height = Math.max(m.minHeight, needed)
  const spineY = -top + m.padY + (height - needed) / 2

  const shift = <T extends { y: number }>(o: T): T => ({ ...o, y: o.y + spineY })
  const shifted = nodes.map(shift)

  return {
    width,
    height,
    spineY,
    spineStart: m.startX - 60,
    spineEnd,
    nodes: shifted,
    groups: groups.map(shift),
    notes: notes.map(shift),
    connectors: connectors.map((c) => ({ ...c, d: translatePath(c.d, spineY) })),
    stageX,
    byId: new Map(shifted.map((n) => [n.id, n])),
  }
}

/** Shifts every y in an "M x y C x y, x y, x y" path. */
function translatePath(d: string, dy: number): string {
  let i = 0
  return d.replace(/-?\d+(\.\d+)?/g, (num) => {
    const v = parseFloat(num)
    i += 1
    return (i % 2 === 0 ? v + dy : v).toFixed(1)
  })
}
