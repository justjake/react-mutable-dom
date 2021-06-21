import {
	createContext,
	RefCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { MutableRegistry } from "./MutableRegistry"
import { OnMutations } from "./types"
import { DOMLock, useUnlockForRender } from "./useRevertMutations"

export const mutationsContext = createContext<MutationsContext | undefined>(
	undefined
)
mutationsContext.displayName = "Mutations"

export interface MutationsContext {
	lock: DOMLock
	registry: MutableRegistry
}

export function useMutations(eventHandler?: OnMutations): {
	ref: RefCallback<Node>
	mutate: DOMLock["mutate"]
} {
	const context = useContext(mutationsContext)
	if (!context) {
		throw new Error(
			"No mutations context provided. Render a MutableRoot above this component in the tree"
		)
	}

	const id = useRef({})
	const [node, setNode] = useState<Node>()

	useEffect(() => {
		if (eventHandler) {
			return context.registry.register(id.current, node, eventHandler)
		}
	}, [context.registry, node, eventHandler])

	useUnlockForRender(context.lock)

	return useMemo(() => {
		return {
			ref: setNode,
			mutate: context.lock.mutate,
		}
	}, [context.lock])
}
