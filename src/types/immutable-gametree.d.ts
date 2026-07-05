declare module '@sabaki/immutable-gametree' {
  export interface NodeObject {
    id: string | number
    data: Record<string, (string | number)[]>
    parentId: string | number | null
    children: NodeObject[]
  }

  export interface CurrentsObject {
    [id: string | number]: string | number
  }

  export class Draft {
    root: NodeObject
    get(id: string | number): NodeObject | null
    appendNode(
      parentId: string | number,
      data: Record<string, unknown>,
      options?: { disableMerging?: boolean },
    ): string | number | null
    UNSAFE_appendNodeWithId(
      parentId: string | number,
      id: string | number,
      data: Record<string, unknown>,
      options?: { disableMerging?: boolean },
    ): boolean
    removeNode(id: string | number): boolean
    shiftNode(
      id: string | number,
      direction: 'left' | 'right' | 'main',
    ): number | null
    makeRoot(id: string | number): boolean
    addToProperty(
      id: string | number,
      property: string,
      value: string | number,
    ): boolean
    removeFromProperty(
      id: string | number,
      property: string,
      value: string | number,
    ): boolean
    updateProperty(
      id: string | number,
      property: string,
      values: (string | number)[],
    ): boolean
    removeProperty(id: string | number, property: string): boolean
  }

  export class GameTree {
    getId: () => string | number
    merger: (
      node: NodeObject,
      data: Record<string, unknown>,
    ) => Record<string, unknown> | null
    root: NodeObject
    _nodeCache: Record<string, NodeObject | null>

    constructor(options?: {
      getId?: () => string | number
      merger?: (
        node: NodeObject,
        data: Record<string, unknown>,
      ) => Record<string, unknown> | null
      root?: NodeObject
    })

    get(id: string | number): NodeObject | null
    getSequence(id: string | number): Generator<NodeObject>
    mutate(mutator: (draft: Draft) => void): GameTree
    navigate(
      id: string | number,
      step: number,
      currents: CurrentsObject,
    ): NodeObject | null
    listNodes(): Generator<NodeObject>
    listNodesHorizontally(
      startId: string | number,
      step: number,
    ): Generator<NodeObject>
    listNodesVertically(
      startId: string | number,
      step: number,
      currents: CurrentsObject,
    ): Generator<NodeObject>
    listCurrentNodes(currents: CurrentsObject): Generator<NodeObject>
    listMainNodes(): Generator<NodeObject>
    getLevel(id: string | number): number | null
    getSection(level: number): Generator<NodeObject>
    getCurrentHeight(currents: CurrentsObject): number
    getHeight(): number
    getHash(): string
    getStructureHash(): string
    onCurrentLine(id: string | number, currents: CurrentsObject): boolean
    onMainLine(id: string | number): boolean
    toJSON(): NodeObject
  }

  export default GameTree
}
