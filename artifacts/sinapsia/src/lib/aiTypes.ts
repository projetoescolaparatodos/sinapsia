export interface AiNode {
  id: string
  label: string
  description?: string
  parentId: string | null
  linkLabel?: string
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'yellow' | 'teal' | 'pink'
  shape?: 'rectangle' | 'ellipse' | 'cloud' | 'hexagon' | 'oval'
  imageUrl?: string
}

export interface AiEdge {
  from: string
  to: string
  label?: string
  color?: AiNode['color']
}

export interface AiAnnotation {
  text: string
  nearNodeId?: string
  color?: AiNode['color']
  size?: 'small' | 'medium' | 'large'
}

export interface AiBoard {
  title: string
  nodes: AiNode[]
  edges?: AiEdge[]
  annotations?: AiAnnotation[]
}
