import { MutableRefObject, Ref, RefCallback, useCallback } from "react"

type MergableRef<T> = MutableRefObject<T> | RefCallback<T>

export function useMergeRefs<T>(refs: MergableRef<T>[]): RefCallback<T> {
  return useCallback<RefCallback<T>>(value => {
    refs.forEach(ref => {
      if (!ref) {
        return
      }

      if (typeof ref === 'function') {
        ref(value)
        return
      }

      if ('current' in ref) {
        (ref.current as any) = value
        return
      }

      // Unknown ref type.
    })
  }, refs)
}
