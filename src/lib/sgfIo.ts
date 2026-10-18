import { parse, stringify, sgfNodeToGameTreeNode } from '@kaya/sgf'
import type { SGFNode, SGFNodeData } from '@kaya/sgf'
import { GameTree } from '@kaya/gametree'
import type { GameTreeNode } from '@kaya/gametree'
import { analysisToKa, metadataToSgf, metadataFromSgf } from './analysisSgf.ts'
import type { AnalysisMetadata } from './analysisSgf.ts'
import type { AnalyzeResponse } from './engine/types.ts'

export { GameTree }

/** Analysis content to embed into the SGF at save time. */
export interface SgfAnalysisEmbed {
  /** Tree node id → cached analysis for that position. */
  readonly analysisByNodeId: ReadonlyMap<string, SgfAnalysisEntry>
  /** Run provenance written once to the root node (KAM property). */
  readonly metadata: AnalysisMetadata
}

export interface SgfAnalysisEntry {
  readonly analysis: AnalyzeResponse
  readonly durationMs: number | null
}

export function treeToSGF(
  tree: GameTree,
  size: number = 19,
  embed?: SgfAnalysisEmbed,
): string {
  const attach = (node: GameTreeNode): GameTreeNode => {
    const data = { ...node.data } as SGFNodeData
    const entry = embed?.analysisByNodeId.get(String(node.id))
    if (entry !== undefined && entry.analysis !== null) {
      data.KA = [analysisToKa(entry.analysis)]
    }
    const children = node.children.map(attach)
    return { ...node, data, children }
  }

  const rootNode = attach(tree.root)
  const root: GameTreeNode = {
    ...rootNode,
    data: {
      FF: ['4'],
      GM: ['1'],
      SZ: [String(size)],
      ...rootNode.data,
      ...(embed !== undefined ? { KAM: [metadataToSgf(embed.metadata)] } : {}),
    } as SGFNodeData,
  }
  return stringify([root as SGFNode])
}

export function sgfToTree(sgf: string): GameTree {
  const parsedNodes = parse(sgf) as SGFNode[]
  if (parsedNodes.length === 0) {
    throw new Error('No valid game tree found in SGF')
  }

  const root = sgfNodeToGameTreeNode(parsedNodes[0]!)
  const hasContent =
    Object.keys(root.data).length > 0 || root.children.length > 0
  if (!hasContent) {
    throw new Error('SGF contains no game data')
  }

  const tree = new GameTree({ root: root as GameTreeNode })

  let currentNode = tree.root
  while (currentNode.children.length > 0) {
    currentNode = currentNode.children[0]!
  }
  tree.currentId = currentNode.id

  return tree
}

export function downloadSGF(
  tree: GameTree,
  filename: string,
  size: number = 19,
  embed?: SgfAnalysisEmbed,
): void {
  const sgfText = treeToSGF(tree, size, embed)
  const blob = new Blob([sgfText], { type: 'application/x-go-sgf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Read the KAM provenance metadata off a loaded tree's root, if present. */
export function getAnalysisMetadataFromTree(tree: GameTree): AnalysisMetadata | null {
  const kam = (tree.root.data as { KAM?: string[] }).KAM?.[0]
  return metadataFromSgf(kam ?? null)
}

export function loadSGFFile(file: File): Promise<GameTree> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const contents = reader.result as string
        const tree = sgfToTree(contents)
        resolve(tree)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export function getBoardSizeFromTree(tree: GameTree): number {
  const sz = tree.root.data.SZ
  if (sz != null && sz.length > 0) {
    const size = Number(sz[0])
    if (!Number.isNaN(size) && size > 0) {
      return size
    }
  }
  return 19
}
