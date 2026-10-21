import { useEffect, useState } from 'react'

// Claude-style loading: a pulsing spark next to softly shimmering text.
export default function Thinking({ text, phrases }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!phrases || phrases.length < 2) return
    const id = setInterval(() => setI((n) => (n + 1) % phrases.length), 2600)
    return () => clearInterval(id)
  }, [phrases])
  return (
    <div className="thinking" role="status" aria-live="polite">
      <svg className="spark" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span className="shimmer">{phrases ? phrases[i] : text}</span>
    </div>
  )
}
