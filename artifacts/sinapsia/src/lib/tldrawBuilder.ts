import type { AiBoard, AiNode } from './aiTypes'

interface TLShapeBase {
  typeName: 'shape'
  id: string
  type: string
  x: number
  y: number
  rotation: number
  isLocked: boolean
  opacity: number
  meta: Record<string, unknown>
  parentId: string
  index: string
  props: Record<string, unknown>
}

interface TLAssetBase {
  id: string
  typeName: 'asset'
  type: string
  props: Record<string, unknown>
  meta: Record<string, unknown>
}

export interface TldrawBoardResult {
  shapeRecords: TLShapeBase[]
  arrowRecords: TLShapeBase[]
  assetRecords: TLAssetBase[]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 11)
}

const INDEX_CHARS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function makeIndex(i: number): string {
  const c1 = INDEX_CHARS[Math.floor(i / INDEX_CHARS.length) % INDEX_CHARS.length]
  const c2 = INDEX_CHARS[i % INDEX_CHARS.length]
  return i < INDEX_CHARS.length ? `a${c2}` : `a${c1}${c2}`
}

function calcShapeDims(label: string, level: number): { w: number; h: number } {
  // Actual tldraw label font sizes: l=36px, m=24px, s=18px
  const fontPx = [36, 24, 18, 18][Math.min(level, 3)]
  const charPx = fontPx * 0.58
  const lineH = fontPx * 1.4
  const pad = 32

  // Dynamic width: aim for ~2 lines
  const minW = [200, 160, 140, 120][Math.min(level, 3)]
  const maxW = [360, 300, 260, 220][Math.min(level, 3)]
  const idealW = Math.ceil(Math.ceil(label.length / 2) * charPx) + pad
  const w = Math.min(maxW, Math.max(minW, idealW))

  // Height based on actual wrapped lines
  const charsPerLine = Math.max(1, Math.floor((w - pad) / charPx))
  const lines = Math.ceil(label.length / charsPerLine)
  const minH = [80, 64, 52, 46][Math.min(level, 3)]
  return { w, h: Math.max(minH, Math.ceil(lines * lineH) + pad) }
}

const COLOR_MAP: Record<string, string> = {
  blue: 'blue',
  green: 'green',
  purple: 'violet',
  orange: 'orange',
  red: 'red',
  yellow: 'yellow',
  teal: 'light-blue',
  pink: 'light-violet',
}

interface NodeLayout {
  id: string
  shapeId: string
  cx: number
  cy: number
  w: number
  h: number
  level: number
}

function computeLayout(nodes: AiNode[]): Map<string, NodeLayout> {
  const layout = new Map<string, NodeLayout>()

  const childrenOf = new Map<string | null, AiNode[]>()
  for (const n of nodes) {
    const key = n.parentId
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(n)
  }

  const roots = childrenOf.get(null) ?? []
  if (roots.length === 0) return layout

  const root = roots[0]
  const rootDims = calcShapeDims(root.label, 0)

  layout.set(root.id, {
    id: root.id,
    shapeId: `shape:${uid()}`,
    cx: 0, cy: 0,
    w: rootDims.w, h: rootDims.h,
    level: 0,
  })

  function placeChildren(
    parentId: string,
    parentCx: number,
    parentCy: number,
    level: number,
    inheritedAngle: number,
  ) {
    const children = childrenOf.get(parentId) ?? []
    if (children.length === 0) return

    const radii = [0, 460, 360, 290]
    const r = radii[level] ?? 240

    if (level === 1) {
      for (let i = 0; i < children.length; i++) {
        const angle = ((2 * Math.PI) / children.length) * i - Math.PI / 2
        const cx = Math.round(Math.cos(angle) * r)
        const cy = Math.round(Math.sin(angle) * r)
        const node = children[i]
        const { w, h } = calcShapeDims(node.label, level)
        layout.set(node.id, { id: node.id, shapeId: `shape:${uid()}`, cx, cy, w, h, level })
        placeChildren(node.id, cx, cy, level + 1, angle)
      }
    } else {
      const spreadAngle = Math.min(Math.PI * 0.65, (Math.PI / 4) * children.length)
      const startAngle = inheritedAngle - spreadAngle / 2

      for (let i = 0; i < children.length; i++) {
        const angle = children.length === 1
          ? inheritedAngle
          : startAngle + (spreadAngle / (children.length - 1)) * i

        const cx = Math.round(parentCx + Math.cos(angle) * r)
        const cy = Math.round(parentCy + Math.sin(angle) * r)
        const node = children[i]
        const { w, h } = calcShapeDims(node.label, level)
        layout.set(node.id, { id: node.id, shapeId: `shape:${uid()}`, cx, cy, w, h, level })
        placeChildren(node.id, cx, cy, level + 1, angle)
      }
    }
  }

  placeChildren(root.id, 0, 0, 1, -Math.PI / 2)
  return layout
}

function buildGeoShape(node: AiNode, layoutInfo: NodeLayout, index: string): TLShapeBase {
  const tlColor = COLOR_MAP[node.color] ?? 'blue'
  const level = layoutInfo.level
  const { shapeId, cx, cy, w, h } = layoutInfo

  let fill: string
  let size: string
  let font: string
  let labelSize: string

  if (level === 0) {
    fill = 'solid'; size = 'l'; font = 'sans'; labelSize = 'l'
  } else if (level === 1) {
    fill = 'semi'; size = 'm'; font = 'sans'; labelSize = 'm'
  } else if (level === 2) {
    fill = 'semi'; size = 's'; font = 'sans'; labelSize = 's'
  } else {
    fill = 'none'; size = 's'; font = 'sans'; labelSize = 's'
  }

  const geoType = node.shape ?? 'rectangle'
  const text = node.label

  return {
    typeName: 'shape',
    id: shapeId,
    type: 'geo',
    x: cx - w / 2,
    y: cy - h / 2,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    parentId: 'page:page',
    index,
    props: {
      geo: geoType, w, h, text,
      color: tlColor, labelColor: 'black', fill,
      dash: level === 0 ? 'solid' : 'draw',
      size: labelSize, font,
      align: 'middle', verticalAlign: 'middle',
      growY: 0, url: '', scale: 1,
    },
  }
}

function buildBookmarkShape(
  imageUrl: string,
  x: number,
  y: number,
  index: string,
): { shape: TLShapeBase; asset: TLAssetBase } {
  const assetId = `asset:img_${uid()}`
  const asset: TLAssetBase = {
    id: assetId,
    typeName: 'asset',
    type: 'bookmark',
    props: {
      src: imageUrl,
      description: '',
      image: imageUrl,
      favicon: '',
      title: '',
    },
    meta: {},
  }
  const shape: TLShapeBase = {
    typeName: 'shape',
    id: `shape:${uid()}`,
    type: 'bookmark',
    x, y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    parentId: 'page:page',
    index,
    props: { url: imageUrl, w: 300, h: 320, assetId },
  }
  return { shape, asset }
}

function buildTextShape(
  text: string,
  x: number,
  y: number,
  tlColor: string,
  size: string,
  index: string,
): TLShapeBase {
  const sizeMap: Record<string, string> = { small: 's', medium: 'm', large: 'l' }
  return {
    typeName: 'shape',
    id: `shape:${uid()}`,
    type: 'text',
    x, y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    parentId: 'page:page',
    index,
    props: {
      color: tlColor,
      size: sizeMap[size] ?? 's',
      text,
      font: 'draw',
      textAlign: 'middle',
      autoSize: true,
      scale: 1,
      w: 200,
    },
  }
}

function buildArrowShape(
  fromLayout: NodeLayout,
  toLayout: NodeLayout,
  arrowColor: string,
  index: string,
  linkLabel?: string,
): TLShapeBase {
  const dx = toLayout.cx - fromLayout.cx
  const dy = toLayout.cy - fromLayout.cy
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = dx / len
  const ny = dy / len

  const startX = fromLayout.cx + nx * (fromLayout.w / 2 + 4)
  const startY = fromLayout.cy + ny * (fromLayout.h / 2 + 4)
  const endX = toLayout.cx - nx * (toLayout.w / 2 + 4)
  const endY = toLayout.cy - ny * (toLayout.h / 2 + 4)

  return {
    typeName: 'shape',
    id: `shape:${uid()}`,
    type: 'arrow',
    x: startX,
    y: startY,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    parentId: 'page:page',
    index,
    props: {
      dash: 'draw', size: 's', fill: 'none',
      color: arrowColor, labelColor: 'black',
      bend: 0,
      start: { x: 0, y: 0 },
      end: { x: endX - startX, y: endY - startY },
      arrowheadStart: 'none', arrowheadEnd: 'arrow',
      text: linkLabel ?? '', labelPosition: 0.5, font: 'draw', scale: 1,
    },
  }
}

export function buildTldrawBoard(board: AiBoard): TldrawBoardResult {
  const layout = computeLayout(board.nodes)
  const shapeRecords: TLShapeBase[] = []
  const arrowRecords: TLShapeBase[] = []
  const assetRecords: TLAssetBase[] = []
  let shapeIdx = 0

  for (const node of board.nodes) {
    const layoutInfo = layout.get(node.id)
    if (!layoutInfo) continue
    shapeRecords.push(buildGeoShape(node, layoutInfo, makeIndex(shapeIdx++)))
    if (node.imageUrl) {
      const { shape, asset } = buildBookmarkShape(
        node.imageUrl,
        layoutInfo.cx + layoutInfo.w / 2 + 20,
        layoutInfo.cy - 160,
        makeIndex(shapeIdx++),
      )
      shapeRecords.push(shape)
      assetRecords.push(asset)
    }
  }

  for (const node of board.nodes) {
    if (!node.parentId) continue
    const fromLayout = layout.get(node.parentId)
    const toLayout = layout.get(node.id)
    if (!fromLayout || !toLayout) continue
    arrowRecords.push(buildArrowShape(fromLayout, toLayout, 'grey', makeIndex(shapeIdx++), node.linkLabel))
  }

  for (const edge of board.edges ?? []) {
    const fromLayout = layout.get(edge.from)
    const toLayout = layout.get(edge.to)
    if (!fromLayout || !toLayout) continue
    const tlColor = edge.color ? (COLOR_MAP[edge.color] ?? 'light-violet') : 'light-violet'
    arrowRecords.push(buildArrowShape(fromLayout, toLayout, tlColor, makeIndex(shapeIdx++), edge.label))
  }

  for (const ann of board.annotations ?? []) {
    let x = 0, y = 0
    if (ann.nearNodeId) {
      const ref = layout.get(ann.nearNodeId)
      if (ref) { x = ref.cx + ref.w / 2 + 24; y = ref.cy - 24 }
    } else {
      x = (shapeIdx % 4 - 2) * 250
      y = -700 - Math.floor(shapeIdx / 4) * 120
    }
    const tlColor = ann.color ? (COLOR_MAP[ann.color] ?? 'grey') : 'grey'
    shapeRecords.push(buildTextShape(ann.text, x, y, tlColor, ann.size ?? 'small', makeIndex(shapeIdx++)))
  }

  return { shapeRecords, arrowRecords, assetRecords }
}
