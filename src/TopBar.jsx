import { useEffect, useRef, useState } from 'react'
import { subscribe } from './net.js'

// Small spinning spark in the top-right corner while a request is running (no long bar).
export default function TopBar() {
  const [show, setShow] = useState(false)
  const timer = useRef()

  useEffect(() => subscribe((n) => {
    clearTimeout(timer.current)
    if (n > 0) timer.current = setTimeout(() => setShow(true), 250) // skip flicker on instant requests
    else timer.current = setTimeout(() => setShow(false), 300)
  }), [])

  return (
    <div className={`busy-spark ${show ? 'on' : ''}`} role="status" aria-label="Working">
      <svg className="spark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </div>
  )
}
