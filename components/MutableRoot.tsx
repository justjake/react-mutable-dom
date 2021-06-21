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
import { PolymorphicProps, Polymorphic, defaultElement } from "./polymorphic"
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
			const depthFirstListeners = Array.from(
				registry.nodeToHandler.entries()
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

			for (const [node, handler] of depthFirstListeners) {
				const filteredMutations = mutations.filter(mutation => {
					if (stopPropagationSet.has(mutation)) {
						return false
					}

					return mutationIsInside(mutation, node)
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
							mutationIsInside(mutation, parentNode)
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

function mutationIsInside(mutation: MutationRecord, node: Node): boolean {
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
