import React, {
	RefCallback,
	useContext,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { ReactNode } from "react"
import { OnMutations } from "./types"

export interface DOMLock {
	/** Is this locked? */
	isLocked(): boolean
	/** Perform a mutation to the DOM tree. Once the mutation returns, we lock again */
	mutate<T>(fn: (root: Node | null) => T): T
	/** Unlock in order to render.  */
	unlockForRender(): void
	/** Re-lock after an unlockForRender  */
	lockAfterRender(): void
}

export interface UseRevertMutationsResult extends DOMLock {
	ref: RefCallback<Node>
}

/**
 * Wraps an actual LockMutationAPI to ensure referential stability, and to
 * provide a default no-op implementation if there's no lock component in
 * the tree.
 */
export class IndirectDOMLock implements DOMLock {
	constructor(public actual: DOMLock | undefined) {}

	readonly isLocked = () => {
		return this.actual?.isLocked() ?? false
	}

	readonly unlockForRender = () => {
		this.actual?.unlockForRender()
	}

	readonly lockAfterRender = () => {
		this.actual?.lockAfterRender()
	}

	readonly mutate: DOMLock["mutate"] = fn => {
		if (this.actual) {
			return this.actual.mutate(fn)
		}

		return fn(null)
	}
}

/**
 * Allow this component to render even if the DOM is locked by a parent
 * DOMMutationLock component.
 */
export function useUnlockForRender(locker: DOMLock) {
	useLayoutEffect(() => {
		locker.lockAfterRender()
		return locker.unlockForRender
	})
}

const observeOptions: MutationObserverInit = {
	// Need to roll back changes to the tree deeply
	subtree: true,
	childList: true,
	// Need to roll back attribute changes
	attributes: true,
	attributeOldValue: true,
	// Need to roll back text changes
	characterData: true,
	characterDataOldValue: true,
}

export type LowLevelOnMutations = (mutations: MutationRecord[]) => void

/**
 * Revert all mutations within `root`. Use inside a contentEditable to prevent
 * the browser from mucking with stuff.
 * Building block, perhaps choose a higher-level interface.
 *
 * Any component or action that needs to mutate the DOM within `root`
 * must use the returned DOMLock to unlock the DOM during rendering
 * or mutation.
 *
 * @param root DOM node.
 * @param onMutations Called after the mutations are reverted.
 * @see useUnlockForRender
 */
export function useRevertMutations(
	revert: boolean,
	onMutations?: LowLevelOnMutations
): UseRevertMutationsResult {
	// Create refs. We'll apply changes below.
	const nodeRef = useRef<Node>()
	const shouldRevert = useRef(revert)
	const onMutationsRef = useRef<LowLevelOnMutations | undefined>(onMutations)

	// We use useState() to guarantee a closure that runs only once.
	// We're never going to replace the state from the closure.
	const [state] = useState<UseRevertMutationsResult>(() => {
		let isObserving = false

		const queue: MutationRecord[] = []
		const observer =
			typeof MutationObserver == "undefined"
				? undefined
				: new MutationObserver(records => {
						queue.push(...records)
						stopObservingAndRollBackChanges()
						startObserving()
				  })

		function setNode(node: Node | null | undefined) {
			mutate(() => (nodeRef.current = node))
		}

		function startObserving() {
			if (isObserving) {
				return
			}

			const node = nodeRef.current
			if (node) {
				observer?.observe(node, observeOptions)
				isObserving = true
			}
		}

		function stopObservingAndRollBackChanges() {
			if (observer) {
				observer.disconnect()
				isObserving = false
				// Important: order mutations from newest to oldest so we can revert them
				// one at a time.
				const mutations = queue.concat(observer.takeRecords())
				queue.length = 0

				onMutationsRef.current(mutations.slice())

				/**
				 * OOPS OOPS OOPS BIG CONCEPTUAL PROBLEM:
				 *
				 * If we revert mutations before calling our event handlers, then the event handler
				 * can't access the "new" state, since we destroyed that state by reverting the mutations
				 * already.
				 *
				 * But, if we try to call event handlers BEFORE reverting the mutations, then the DOM might
				 * have changed in an arbitrary way, and we might not be able to bubble our events up the "old"
				 * DOM tree.
				 *
				 * The best solution is probably to save a snapshot of the event bubbling path after every render
				 * phase, or after every revert, or right before we start watching for changes -- then
				 * we dispatch our events using that saved DOM state before we do the reverts.
				 */
				for (const mutation of mutations.reverse()) {
					// Revert in reverse order
					revertDOMMutation(mutation)
				}
			}
		}

		function mutate<T>(fn: (root: Node | null) => T): T {
			const shouldLockAfterMutation = isObserving
			try {
				stopObservingAndRollBackChanges()
				return fn(nodeRef.current)
			} finally {
				if (shouldLockAfterMutation) {
					startObserving()
				}
			}
		}

		function unlockForRender() {
			stopObservingAndRollBackChanges()
		}

		function lockAfterRender() {
			if (shouldRevert.current) {
				startObserving()
			}
		}

		function isLocked() {
			return shouldRevert.current
		}

		return {
			mutate,
			isLocked,
			unlockForRender,
			lockAfterRender,
			ref: setNode,
		}
	})

	// Apply changes to refs.
	onMutationsRef.current = onMutations // TODO: move to layout effect go guarantee delivery of previous handler?
	useLayoutEffect(() => {
		// Apply change to nodeRef during layout effect
		// so that the previous render's effects still use the previous render's
		// root... unclear if this is actually needed...
		shouldRevert.current = revert
		state.lockAfterRender()
		return state.unlockForRender
	})

	return state
}

/**
 * Undo a DOM mutation recorded by a MutationObserver.
 * To revert an attribute or characterData mutation, the observer must be configured with
 *   attributeOldValue: true
 *   characterDataOldValue: true
 * Inspired by https://github.com/kitten/use-editable/blob/852dc60c37da71e11519bd426546ab317f55a1f9/src/useEditable.ts#L348-L365
 * See also https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord
 */
function revertDOMMutation(mutation: MutationRecord) {
	console.warn("Reverted mutation of locked DOM tree", mutation)

	switch (mutation.type) {
		case "attributes": {
			if (mutation.target instanceof Element && mutation.attributeName) {
				if (mutation.oldValue === null) {
					mutation.target.removeAttribute(mutation.attributeName)
					return
				}
				mutation.target.setAttribute(mutation.attributeName, mutation.oldValue)
				return
			}
			break
		}
		case "characterData": {
			mutation.target.textContent = mutation.oldValue
			return
		}
		case "childList": {
			let i = 0
			for (i = mutation.removedNodes.length - 1; i >= 0; i--) {
				mutation.target.insertBefore(
					mutation.removedNodes[i],
					mutation.nextSibling
				)
			}
			for (i = mutation.addedNodes.length - 1; i >= 0; i--) {
				const node = mutation.addedNodes[i]
				if (node.parentNode) {
					node.parentNode.removeChild(node)
				}
			}
			return
		}
	}

	// eslint-disable-next-line no-console
	console.error("Could not roll back mutation", mutation)
}
