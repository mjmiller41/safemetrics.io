import { useEffect, useRef, useState } from 'react'

/** Measure an element so SVG charts can lay out against real pixels. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(720)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next && next > 0) setWidth(next)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width || 720)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
