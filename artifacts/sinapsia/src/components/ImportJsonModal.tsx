import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bot, Check, ChevronRight, ClipboardCopy, TriangleAlert, X } from 'lucide-react'
import { buildTldrawBoard } from '@/lib/tldrawBuilder'
import type { AiBoard } from '@/lib/aiTypes'

interface GeneratedShapes {
  shapeRecords: ReturnType<typeof buildTldrawBoard>['shapeRecords']
  arrowRecords: ReturnType<typeof buildTldrawBoard>['arrowRecords']
  assetRecords: ReturnType<typeof buildTldrawBoard>['assetRecords']
  title: string
  replaceAll?: boolean
}

interface ImportJsonModalProps {
  onClose: () => void
  onApply: (result: GeneratedShapes) => void
  hasExistingContent: boolean
}

const PROMPT_TEMPLATE = `Gere um mapa conceitual rico em JSON seguindo EXATAMENTE este formato:

{
  "title": "Título do mapa",
  "nodes": [
    {
      "id": "n0",
      "label": "Conceito Central",
      "parentId": null,
      "color": "blue",
      "shape": "rectangle"
    },
    {
      "id": "n1",
      "label": "Subcategoria A",
      "parentId": "n0",
      "linkLabel": "são",
      "color": "green",
      "shape": "rectangle"
    },
    {
      "id": "n2",
      "label": "Subcategoria B",
      "parentId": "n0",
      "linkLabel": "incluem",
      "color": "orange",
      "shape": "ellipse"
    },
    {
      "id": "n3",
      "label": "Conceito Destacado",
      "parentId": "n1",
      "linkLabel": "tais como",
      "color": "purple",
      "shape": "star"
    }
  ],
  "edges": [
    {
      "from": "n2",
      "to": "n3",
      "label": "relaciona-se com",
      "color": "teal"
    }
  ],
  "annotations": [
    {
      "text": "Nota de contexto\nsobre este conceito",
      "nearNodeId": "n1",
      "color": "orange",
      "size": "small"
    }
  ]
}

Regras obrigatórias:
- Exatamente 1 nó com parentId: null (a raiz)
- Todos os outros nós devem ter parentId apontando para um id existente
- color: blue | green | purple | orange | red | yellow | teal | pink
- shape: rectangle | ellipse | cloud | hexagon | oval
- id deve ser único (n0, n1, n2...)
- linkLabel: verbo/frase na seta do pai para este nó (ex: "são", "incluem", "causam", "produzem", "tais como", "podem ser", "resultam em", "diferem de", "permitem", "necessitam de")
- edges: conexões cruzadas entre nós não-hierárquicos (use para relações transversais ou bidirecionais)
- annotations: textos flutuantes com contexto, notas explicativas ou fatos relevantes próximos a um nó

REGRAS DE COR — coesão por ramo (IMPORTANTE):
- Raiz: sempre blue
- Cada ramo principal (filho direto da raiz) recebe UMA cor diferente: green, orange, purple, teal, red, yellow, pink
- Todos os descendentes de um ramo HERDAM a cor do ramo pai (mantenha coesão visual)
- NÃO use cores aleatórias — a cor identifica o grupo/tópico

REGRAS DE SHAPE — apenas com propósito:
- rectangle: padrão para conceitos principais e nós hierárquicos
- ellipse/oval: processos, ações, nós folha (sem filhos)
- cloud: conceitos abstratos, exceções, ideias difusas
- hexagon: categorias especiais — use raramente
- NÃO varie shapes apenas para decoração

- Gere entre 10-18 nós para um mapa rico
- Retorne APENAS o JSON, sem texto antes ou depois

Tema do mapa: [DESCREVA SEU TEMA AQUI]`

function validateAiBoard(obj: unknown): { valid: true; board: AiBoard } | { valid: false; error: string } {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'JSON inválido: esperava um objeto.' }
  const b = obj as Record<string, unknown>
  if (typeof b.title !== 'string' || !b.title.trim()) return { valid: false, error: 'Campo "title" ausente ou vazio.' }
  if (!Array.isArray(b.nodes) || b.nodes.length === 0) return { valid: false, error: 'Campo "nodes" ausente ou vazio.' }

  const ids = new Set<string>()
  const roots: string[] = []

  for (let i = 0; i < b.nodes.length; i++) {
    const n = b.nodes[i] as Record<string, unknown>
    if (typeof n.id !== 'string' || !n.id) return { valid: false, error: `nodes[${i}]: campo "id" ausente.` }
    if (typeof n.label !== 'string' || !n.label) return { valid: false, error: `nodes[${i}] (id "${n.id}"): campo "label" ausente.` }
    if (n.parentId !== null && typeof n.parentId !== 'string') return { valid: false, error: `nodes[${i}] (id "${n.id}"): "parentId" deve ser string ou null.` }
    if (ids.has(n.id as string)) return { valid: false, error: `nodes[${i}]: id "${n.id}" duplicado.` }
    ids.add(n.id as string)
    if (n.parentId === null) roots.push(n.id as string)
  }

  if (roots.length === 0) return { valid: false, error: 'Nenhum nó raiz encontrado (parentId: null).' }
  if (roots.length > 1) return { valid: false, error: `Mais de um nó raiz encontrado: ${roots.join(', ')}. Só pode haver um.` }

  for (const n of b.nodes as Record<string, unknown>[]) {
    if (n.parentId !== null && !ids.has(n.parentId as string)) {
      return { valid: false, error: `Nó "${n.id}" referencia parentId "${n.parentId}" que não existe.` }
    }
  }

  if (b.edges !== undefined) {
    if (!Array.isArray(b.edges)) return { valid: false, error: 'Campo "edges" deve ser um array.' }
    for (let i = 0; i < b.edges.length; i++) {
      const e = b.edges[i] as Record<string, unknown>
      if (typeof e.from !== 'string' || typeof e.to !== 'string')
        return { valid: false, error: `edges[${i}]: campos "from" e "to" são obrigatórios (string).` }
    }
  }

  return { valid: true, board: b as unknown as AiBoard }
}

export default function ImportJsonModal({ onClose, onApply, hasExistingContent }: ImportJsonModalProps) {
  const [tab, setTab] = useState<'prompt' | 'import'>('prompt')
  const [jsonText, setJsonText] = useState('')
  const [replaceAll, setReplaceAll] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ nodeCount: number; title: string } | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(PROMPT_TEMPLATE)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const handleImport = () => {
    setError(null)
    setPreview(null)

    const trimmed = jsonText.trim()
    if (!trimmed) {
      setError('Cole o JSON gerado pela IA.')
      textareaRef.current?.focus()
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      setError('JSON inválido. Verifique se copiou o bloco completo (abre e fecha com { }).')
      return
    }

    const validation = validateAiBoard(parsed)
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    const board = validation.board
    setPreview({ nodeCount: board.nodes.length, title: board.title })

    const result = buildTldrawBoard(board)
    onApply({ ...result, title: board.title, replaceAll })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (tab === 'import' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleImport()
  }

  const tabCls = (active: boolean) =>
    `flex-1 py-2 text-xs font-semibold transition rounded-lg cursor-pointer ${
      active
        ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm'
        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
    }`

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9100] bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed z-[9101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-700
          bg-white dark:bg-neutral-900 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <Bot size={16} className="text-violet-600 dark:text-violet-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Gerar mapa com IA
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Use ChatGPT, Gemini, Claude — qualquer IA gratuita
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400
              hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700
              dark:hover:text-neutral-300 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4">
          <div className="flex gap-1 rounded-xl bg-neutral-100 dark:bg-neutral-800/60 p-1">
            <button className={tabCls(tab === 'prompt')} onClick={() => setTab('prompt')}>
              1. Copiar prompt
            </button>
            <button className={tabCls(tab === 'import')} onClick={() => setTab('import')}>
              2. Colar JSON
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {tab === 'prompt' && (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Copie o prompt abaixo, cole na sua IA preferida (ChatGPT, Gemini, Claude…),
                edite o tema no final e envie. Depois volte aqui na aba{' '}
                <strong className="text-neutral-900 dark:text-neutral-100">Colar JSON</strong>.
              </p>

              <div className="relative rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
                <pre className="overflow-auto p-3 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap max-h-52">
                  {PROMPT_TEMPLATE}
                </pre>
                <button
                  onClick={handleCopyPrompt}
                  className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg
                    bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600
                    px-2.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200
                    shadow-sm transition hover:bg-neutral-50 dark:hover:bg-neutral-600 cursor-pointer"
                >
                  {copiedPrompt ? <Check size={12} className="text-emerald-500" /> : <ClipboardCopy size={12} />}
                  {copiedPrompt ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              <button
                onClick={() => setTab('import')}
                className="flex w-full items-center justify-center gap-2 rounded-xl
                  bg-violet-600 hover:bg-violet-700 px-4 py-2.5
                  text-sm font-semibold text-white transition cursor-pointer"
              >
                Já tenho o JSON
                <ChevronRight size={15} />
              </button>
            </>
          )}

          {tab === 'import' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
                  Cole o JSON aqui
                </label>
                <textarea
                  ref={textareaRef}
                  value={jsonText}
                  onChange={(e) => { setJsonText(e.target.value); setError(null); setPreview(null) }}
                  placeholder={'{\n  "title": "Meu mapa",\n  "nodes": [...]\n}'}
                  rows={8}
                  autoFocus
                  className="w-full resize-none rounded-xl border border-neutral-200 dark:border-neutral-700
                    bg-neutral-50 dark:bg-neutral-800 px-3 py-2.5 text-sm font-mono
                    text-neutral-900 dark:text-neutral-100
                    placeholder:text-neutral-400 dark:placeholder:text-neutral-500
                    outline-none focus:border-violet-400 dark:focus:border-violet-500
                    focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-900/40 transition"
                />
                <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                  Ctrl+Enter para importar
                </p>
              </div>

              {hasExistingContent && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={replaceAll}
                      onChange={(e) => setReplaceAll(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`h-4 w-4 rounded border transition flex items-center justify-center ${
                        replaceAll
                          ? 'bg-violet-600 border-violet-600'
                          : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'
                      }`}
                    >
                      {replaceAll && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-neutral-700 dark:text-neutral-300">
                    Substituir conteúdo atual do board
                  </span>
                </label>
              )}

              {preview && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30
                  border border-green-200 dark:border-green-800 px-3 py-2.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <p className="text-sm text-green-800 dark:text-green-300">
                    <span className="font-semibold">{preview.title}</span>
                    {' '}— {preview.nodeCount} nós importados com sucesso
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/30
                  border border-red-200 dark:border-red-800 px-3 py-2.5">
                  <TriangleAlert size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {tab === 'import' && (
          <div className="flex items-center justify-end gap-2 border-t border-neutral-100
            dark:border-neutral-800 px-5 py-4">
            <button
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200
                dark:border-neutral-700 bg-transparent px-4 text-sm font-semibold
                text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50
                dark:hover:bg-neutral-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={!jsonText.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600
                hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed
                px-5 text-sm font-semibold text-white transition cursor-pointer"
            >
              <Bot size={15} />
              Importar mapa
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
