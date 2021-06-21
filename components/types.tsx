export interface MutationsEvent {
	readonly mutations: readonly MutationRecord[]
	/**
	 * Stop the given `mutations` from bubbling up to other components. Call this
	 * on the mutation events that you handle internally and don't want components
	 * above your handler in the React tree to consider.
	 */
	stopPropagation(mutations: readonly MutationRecord[]): void

	/**
	 * Get only mutations to or inside of `node`
	 * @param node Parent node
	 */
	mutationsIn(node: Node): readonly MutationRecord[]
	// todo: root dom node?
	// todo: target dom node??
}

export interface OnMutations {
	(event: MutationsEvent): void
}

export function MutableDomRoot(props: { onMutations: OnMutations }) {}
