import { OnMutations } from "./types";

export class MutableRegistry {
  nodeToHandler = new Map<Node, OnMutations>()
  idToNode = new Map<object, Node>()
  depthFirstListeners: Array<[Node, OnMutations]> = []

  /**
   * @param id A stable object representing a component instance
   * @param node The component's DOM node
   * @param onMutations Event handler
   */
  register(id: object, node: Node | null, onMutations: OnMutations) {
    this.unregister(id, false)
    this.idToNode.set(id, node)
    this.nodeToHandler.set(node, onMutations)
    this.recompute()
    return () => this.unregister(id)
  }

  unregister(id: object, recompute = true) {
    const node = this.idToNode.get(id)
    this.idToNode.delete(id)
    this.nodeToHandler.delete(node)
    if (recompute) {
      this.recompute()
    }
  }

  recompute() {
    const depthFirstListeners = Array.from(
      this.nodeToHandler.entries()
    ).sort(([a], [b]) => {
      if (a === b) {
        return 0
      }

      const position = b.compareDocumentPosition(a)
      if (
        position &
        (Node.DOCUMENT_POSITION_PRECEDING |
          Node.DOCUMENT_POSITION_CONTAINED_BY)
      ) {
        return -1
      }

      return 1
    })

    this.depthFirstListeners = depthFirstListeners
  }

  /**
   * 
   * @param targetNode 
   * @returns Ancestors from closest to `targetNode` to farthest from `targetNode`
   */
  findAncestorPath(targetNode: Node): Node[] {
    const ancestors = new Set<Node>()
    for (const node of this.nodeToHandler.keys()) {
      if (node === targetNode || node.contains(targetNode)) {
        ancestors.add(node)
      }
    }

    return Array.from(ancestors).sort((a, b) => {
      if (a.contains(b)) {
        return 1
      }

      if (b.contains(a)) {
        return -1
      }

      return 0
    })
  }
}