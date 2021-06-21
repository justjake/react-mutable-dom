import { OnMutations } from "./types";

export class MutableRegistry {
  nodeToHandler = new Map<Node, OnMutations>()
  idToNode = new Map<object, Node>()

  /**
   * @param id A stable object representing a component instance
   * @param node The component's DOM node
   * @param onMutations Event handler
   */
  register(id: object, node: Node | null, onMutations: OnMutations) {
    this.unregister(id)
    this.idToNode.set(id, node)
    this.nodeToHandler.set(node, onMutations)
    return () => this.unregister(id)
  }

  unregister(id: object) {
    const node = this.idToNode.get(id)
    this.idToNode.delete(id)
    this.nodeToHandler.delete(node)
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