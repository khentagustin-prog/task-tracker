import { useEffect, useRef, useState } from 'react'
import { subscribe } from './net.js'

// Thin bar at the top: climbs while a request is running and completes when it finishes.
export default function TopBar() {
  const [w, setW] = useState(0)
  const [show, setShow] = useState(false)
  const timer = useRef()
  const busy = useRef(false)

  useEffect(() => subscribe((n) => {
    clearInterval(timer.current)
    if (n > 0) {
      if (!busy.current) { busy.current = true; setShow(true); setW(8) }
      timer.current = setInterval(() => setW((x) => x + (90 - x) * 0.08), 200)
    } else if (busy.current) {
      busy.current = false
      setW(100)
      setTimeout(() => { setShow(false); setW(0) }, 300)
    }
  }), [])

  return <div className="topbar" style={{ opacity: show ? 1 : 0 }}><div style={{ width: `${w}%` }} /></div>
}
