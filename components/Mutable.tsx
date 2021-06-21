import {
	ClassAttributes,
	createElement,
	DetailedReactHTMLElement,
	DOMAttributes,
	DOMElement,
	HTMLAttributes,
	InputHTMLAttributes,
	ReactHTML,
	ReactNode,
	ReactSVG,
	ReactSVGElement,
	SVGAttributes,
} from "react"

import React from "react"
import { OnMutations } from "./types"
import { useMergeRefs } from "./useMergeRefs"
import { useMutations } from "./useMutations"
import { Polymorphic, PolymorphicProps, defaultElement } from "./Polymorphic"

interface MutableOwnProps {
	onMutations?: OnMutations
}

export type MutableProps<E extends React.ElementType> = PolymorphicProps<
	E,
	MutableOwnProps
>

export const Mutable = React.forwardRef(
	(
		{ onMutations, ...props }: MutableOwnProps,
		passedRef: React.Ref<Element>
	) => {
		const { ref: mutableRef } = useMutations(onMutations)
		const ref = useMergeRefs([mutableRef, passedRef])
		return <Polymorphic ref={ref} {...props} />
	}
) as <E extends React.ElementType = typeof defaultElement>(
	props: MutableProps<E>
) => JSX.Element
