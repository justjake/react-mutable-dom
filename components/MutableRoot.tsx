import {
	ReactNode,
	Ref,
	useState,
	useCallback,
	forwardRef,
	ElementType,
	useMemo,
	useEffect,
	useRef,
} from "react"
import { MutableRegistry } from "./MutableRegistry"
import { PolymorphicProps, Polymorphic, defaultElement } from "./Polymorphic"
import { OnMutations, MutationsEvent } from "./types"
import { useMergeRefs } from "./useMergeRefs"
import { mutationsContext, MutationsContext } from "./useMutations"
import { LowLevelOnMutations, useRevertMutations } from "./useRevertMutations"

interface MutableRootOwnProps {
	onMutations: OnMutations
	children: ReactNode
	disabled?: boolean
}

export type MutableRootProps<E extends React.ElementType> = PolymorphicProps<
	E,
	MutableRootOwnProps
>

const implementation = function MutableRoot<E extends React.ElementType>(
	props: MutableRootProps<E>,
	passedRef: Ref<Element>
) {
	const { onMutations, disabled, children, ...polymorphicProps } = props
	const [registry] = useState(() => new MutableRegistry())
	const [node, setNode] = useState<Node>()
	const id = useRef({})

	const handleAllMutations = useCallback<LowLevelOnMutations>(
		mutations => {
			const stopPropagationSet = new Set<MutationRecord>()
			const revertedTree = RevertedTree.forMutations(mutations)
			for (const [node, handler] of registry.depthFirstListeners) {
				const filteredMutations = mutations.filter(mutation => {
					if (stopPropagationSet.has(mutation)) {
						return false
					}

					return revertedTree.mutationIsInside(mutation, node)
				})

				if (filteredMutations.length === 0) {
					continue
				}

				const event: MutationsEvent = {
					mutations: filteredMutations,
					stopPropagation(records) {
						records.forEach(record => stopPropagationSet.add(record))
					},
					mutationsIn(parentNode) {
						return filteredMutations.filter(mutation =>
							revertedTree.mutationIsInside(mutation, parentNode)
						)
					},
				}

				// TODO: dispatchEvent?
				// TODO: what if it throws?
				handler(event)

				if (stopPropagationSet.size === mutations.length) {
					// all mutations are stopped
					break
				}
			}
		},
		[registry]
	)

	const locker = useRevertMutations(!props.disabled, handleAllMutations)
	const contextValue = useMemo<MutationsContext>(() => {
		return {
			lock: locker,
			registry,
		}
	}, [locker, registry])

	useEffect(() => {
		if (node) {
			return registry.register(id.current, node, onMutations)
		}
	}, [node, onMutations])

	const mergedRef = useMergeRefs([setNode, locker.ref, passedRef])
	const contentEditable = props.disabled ? undefined : true
	return (
		<mutationsContext.Provider value={contextValue}>
			<Polymorphic
				ref={mergedRef}
				contentEditable={contentEditable}
				suppressContentEditableWarning
				{...polymorphicProps}
			>
				{children}
			</Polymorphic>
		</mutationsContext.Provider>
	)
}

// TODO: mutations may change the DOM nesting structure as expected in depthFirstListeners.
//       we actually need to inspect the mutations array and compute the previous DOM hierarchy
//       so we can simulate event bubbling in the previous hierarchy, instead of relying
//       on the actual DOM structure post-mutation.
//
//       This is quite a tricky idea, actually...
function incorrectMutationIsInside(
	mutation: MutationRecord,
	node: Node
): boolean {
	if (mutation.target === node) {
		return true
	}

	const position = node.compareDocumentPosition(mutation.target)
	return Boolean(position & Node.DOCUMENT_POSITION_CONTAINED_BY)
}

export const MutableRoot = forwardRef(implementation) as <
	E extends ElementType = typeof defaultElement
>(
	props: MutableRootProps<E>
) => JSX.Element

/**
 * Rebuilds enough of the original state of the DOM in order to simulate
 * bubbling mutation events. We can't actually revert the mutations before dispatching
 * our mutation event handler, because doing so makes it hard to parse the *new*
 * state of the DOM.
 *
 * For example, the characterData mutation event has only oldValue, not
 * newValue, because you can just read newValue from mutation.target.innerText.
 *
 * This approach is better than before, but we still have some tricky cases.
 * For example, let's say we have this tree:
 *   X > Y > D
 *   A > B > C
 * Then, node D is moved into C, and then D character value is changed to "foo":
 *   X > Y
 *   A > B > C > D "foo"
 * If we revert the "D added" event, then when we try to bubble the "foo" change,
 * it'll go to Y, instead of going to C, which is weird if we wanted to add that
 * text to C.
 *
 * Another case I don't understand: remove D, then change the char value, then
 * add it back. Do we miss an update in that case??
 *
 * I'm starting to understand why ProseMirror only uses DOM mutation events to
 * decide what parts of the tree to re-parse entirely, instead of trying to
 * assign a semantic meaning to each mutation event.
 */
export class RevertedTree {
	nodeMap = new WeakMap<Node, RevertedNode<Node>>()

	static forMutations(mutations: MutationRecord[]) {
		const instance = new RevertedTree()
		mutations
			.slice()
			.reverse()
			.forEach(m => instance.revertDOMMutation(m))
		return instance
	}

	// TODO: We should consider memoization or some other form of optimization here.
	// Mutation lists can be long, and looking up the tree is O(n) of depth...
	mutationIsInside(mutation: MutationRecord, node: Node): boolean {
		if (mutation.target === node) {
			return true
		}

		let parent = this.getRevertedNode(node)
		while ((parent = parent.parentNode)) {
			if (parent.node === node) {
				return true
			}
		}
		return false
	}

	revertDOMMutation(mutation: MutationRecord) {
		switch (mutation.type) {
			case "attributes": {
				return
			}
			case "characterData": {
				return
			}
			case "childList": {
				let i = 0
				for (i = mutation.removedNodes.length - 1; i >= 0; i--) {
					// A removed node had its parent changed to a different value.
					const removedNode = mutation.removedNodes[i]
					this.getRevertedNode(removedNode).previousParent = mutation.target
				}
				for (i = mutation.addedNodes.length - 1; i >= 0; i--) {
					const node = mutation.addedNodes[i]
					if (node.parentNode) {
						// Nodes added here must have been removed from elsewhere...
						// Is it right to revert these? We could end up losing mutations if we
						// do so...
					}
				}
				return
			}
		}
	}

	getRevertedNode = (node: Node): RevertedNode<Node> => {
		const instance =
			this.nodeMap.get(node) ?? new RevertedNode(node, this.getRevertedNode)
		this.nodeMap.set(node, instance)
		return instance
	}
}

export class RevertedNode<T extends Node = Node> {
	node: T
	previousParent: T | null | undefined = undefined

	constructor(node: T, forNode: (node: T) => RevertedNode<T>) {
		this.getRevertedNode = forNode
		this.node = node
	}

	get parentNode(): RevertedNode<T> | undefined {
		if (this.previousParent !== undefined) {
			return this.previousParent
				? this.getRevertedNode(this.previousParent)
				: undefined
		}

		const parentNode = this.node.parentNode
		if (parentNode) {
			return this.getRevertedNode(parentNode as any)
		}
	}

	setPreviousParent(node: T | null) {
		this.previousParent = node
	}

	private getRevertedNode: (node: T) => RevertedNode<T>
}
