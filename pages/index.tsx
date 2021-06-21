import React, { ReactNode, useCallback, useRef, useState } from "react"
import { Mutable } from "../components/Mutable"
import { MutableRegistry } from "../components/MutableRegistry"
import { MutableRoot } from "../components/MutableRoot"
import { MutationsEvent, OnMutations } from "../components/types"
import {
	LowLevelOnMutations,
	useRevertMutations,
	useUnlockForRender,
} from "../components/useRevertMutations"

function TodoBlock(props: { checked: boolean; text: string }) {
	return (
		<Mutable
			as="ul"
			onMutations={e => {
				console.log("todo mutations", e)
				e.stopPropagation(e.mutations)
			}}
		>
			<li>
				<label>
					<input type="checkbox" checked={props.checked} />
					{props.text}
				</label>
			</li>
		</Mutable>
	)
}

export default function IndexPage(props: {}) {
	return (
		<div>
			<h1>here's an editor</h1>
			<MutableRoot onMutations={mutation => console.log(mutation)}>
				<h2>My cool doc</h2>
				<p>Inside mutable dom root, we receive edit events</p>
				<p>We can also render components that know how to update themselves</p>
				<TodoBlock
					checked={true}
					text={"Here's a Todo block with no children"}
				/>
			</MutableRoot>
		</div>
	)
}
