import { useEffect, useState } from 'react'

// Full-page centered loader, same look as the one in index.html so a refresh never flashes.
// Pass `phrases` to cycle through messages while a long step runs.
export default function PageLoading({ text = 'Loading', phrases, overlay = false }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!phrases || phrases.length < 2) return undefined
    const id = setInterval(() => setI((n) => Math.min(n + 1, phrases.length - 1)), 2500)
    return () => clearInterval(id)
  }, [phrases])
  return (
    <div className={`page-loading ${overlay ? 'overlay' : ''}`} role="status" aria-live="polite">
      <svg className="spark" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
        <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="shimmer">{phrases ? phrases[i] : text}</span>
    </div>
  )
}
