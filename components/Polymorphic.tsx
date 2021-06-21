// Source: https://gist.github.com/kripod/4434e7cecfdecee160026aee49ea6ee8

import { forwardRef } from "react"

// Source: https://github.com/emotion-js/emotion/blob/master/packages/styled-base/types/helper.d.ts
type PropsOf<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	E extends keyof JSX.IntrinsicElements | React.JSXElementConstructor<any>
> = JSX.LibraryManagedAttributes<E, React.ComponentPropsWithRef<E>>

export interface PolymorphicOwnProps<
	E extends React.ElementType = React.ElementType
> {
	as?: E
}

type BasePolymorphicProps<E extends React.ElementType> =
	PolymorphicOwnProps<E> & Omit<PropsOf<E>, keyof PolymorphicOwnProps>

export type PolymorphicProps<E extends React.ElementType, P> = P &
	BasePolymorphicProps<E>

export const defaultElement = "div"

export const Polymorphic = forwardRef(
	({ as, ...restProps }: PolymorphicOwnProps, ref: React.Ref<Element>) => {
		const Element = as || defaultElement
		return <Element ref={ref} {...restProps} />
	}
) as <E extends React.ElementType = typeof defaultElement>(
	props: BasePolymorphicProps<E>
) => JSX.Element
