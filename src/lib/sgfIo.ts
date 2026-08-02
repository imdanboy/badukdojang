import { parse, stringify, sgfNodeToGameTreeNode } from '@kaya/sgf'
import type { SGFNode, SGFNodeData } from '@kaya/sgf'
import { GameTree } from '@kaya/gametree'
import type { GameTreeNode } from '@kaya/gametree'

export { GameTree }

export function treeToSGF(tree: GameTree, size: number = 19): string {
  const root: GameTreeNode = {
    ...tree.root,
    data: {
      FF: ['4'],
      GM: ['1'],
      SZ: [String(size)],
      ...tree.root.data,
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
): void {
  const sgfText = treeToSGF(tree, size)
  const blob = new Blob([sgfText], { type: 'application/x-go-sgf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
