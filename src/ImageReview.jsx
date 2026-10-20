import { useMemo, useRef, useState } from 'react'
import { extractRows } from './extract.js'
import { guessFlow, withGaps, validateReview, summaryOf, formatGapPdf, compareReads, MIN } from './sequence.js'
import { buildSequencePdf } from './seqPdf.js'

// Mga label na ginagamit sa mga PDF nila. Ang label na putol sa larawan ("Dynamic Call w ...") ay ibinabalik sa buong pangalan.
const KNOWN_LABELS = ['Warm Up Text', 'Dynamic Call', 'Special Text', 'Call Reminder', 'Text Reminder']
export function canonicalLabel(raw) {
  const t = (raw || '').trim().replace(/\.{2,}|…/g, '').trim()
  const low = t.toLowerCase()
  const hit = KNOWN_LABELS.find((k) => low === k.toLowerCase()) || KNOWN_LABELS.find((k) => low.startsWith(k.toLowerCase())) || KNOWN_LABELS.find((k) => k.toLowerCase().startsWith(low) && low.length >= 4)
  return hit || t
}
const todayText = () => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` }
const pad = (n) => String(n).padStart(2, '0')
const toMs = (date, time) => (date && time ? Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5)) : null)

// rows galing sa AI -> editable steps. Ang taon ay hinuhulaan mula sa isang taon at tumataas kapag bumaba ang buwan (Dec -> Jan).
function toSteps(rows, year) {
  let y = year, prev = 0
  return rows.map((r, i) => {
    const mo = Number(r.month)
    if (mo && prev && mo < prev - 6) y += 1
    if (mo) prev = mo
    const date = mo && r.day ? `${y}-${pad(mo)}-${pad(Number(r.day))}` : ''
    const step = { idx: i, id: i + '-' + Math.random().toString(36).slice(2, 6), title: (r.title || '').trim(), label: canonicalLabel(r.label), date, time: r.time || '', uncertain: !!r.uncertain, note: r.note || '' }
    step.flow = guessFlow(step)
    return step
  })
}

const MONTHS_UP = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const shortName = (n) => n.trim().toUpperCase().replace(/\s+CASINO$/, '') // "Fortune Bay Casino" -> "FORTUNE BAY"

export default function ImageReview({ casinos = [] }) {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [steps, setSteps] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [meta, setMeta] = useState({ title: '', casino: '', assignedTo: 'KHENT AGUSTIN', organization: 'TEAM TECH DEV', campaignDates: 'Not specified', workflow: '' })
  const input = useRef()
  const [casino, setCasino] = useState('')
  const [aiWarn, setAiWarn] = useState([])
  const [verify, setVerify] = useState(true)
  const [vstate, setVstate] = useState(null) // { phase: 'wait'|'read'|'done'|'failed'|'skipped', left, diffs, warnings, msg }
  const runRef = useRef(0)
  // Punan ang pamagat/campaign/workflow batay sa napiling casino at sa buwan ng unang step. Puwede pa ring baguhin.
  const fillFor = (name, list = steps) => {
    if (!name) return
    const short = shortName(name)
    const first = (list || []).find((x) => x.date)
    const month = first ? MONTHS_UP[Number(first.date.slice(5, 7)) - 1] : ''
    const ct = (list || []).some((x) => /-\d{4}CT\b/i.test(x.title)) ? 'CONTINUITY ' : ''
    setMeta((m) => ({ ...m, title: short, casino: `${short} ${ct}${month}`.trim(), workflow: `${short} - ${month} Gifting Activate/Reminder Automated` }))
  }

  const pick = (f) => {
    if (!f) return
    if (!/^image\//.test(f.type)) { setErr('Larawan lang (PNG o JPG) ang tinatanggap dito.'); return }
    setErr(''); setSteps(null); setConfirmed(false)
    setFile(f); setUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(f) })
    read(f) // awtomatiko: pagka-upload, binabasa na agad
  }
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
  // Ikalawang, hiwalay na pagbasa pagkalipas ng 60s (limitasyon ng Groq ay bawat minuto). Ang hindi magkatugma ay minamarkahan.
  const runVerify = async (f, firstRows, my) => {
    for (let s = 60; s > 0; s--) { setVstate({ phase: 'wait', left: s }); await sleep(1000); if (runRef.current !== my) return }
    setVstate({ phase: 'read' })
    try {
      const out2 = await extractRows(f)
      if (runRef.current !== my) return
      const { diffs, warnings } = compareReads(firstRows, out2.rows)
      setSteps((prev) => prev && prev.map((x) => (diffs[x.idx] !== undefined ? { ...x, uncertain: true, note: [x.note, 'magkaiba ang ikalawang pagbasa -> ' + diffs[x.idx]].filter(Boolean).join('; ') } : x)))
      setVstate({ phase: 'done', diffs: Object.keys(diffs).length, warnings })
    } catch (e) { if (runRef.current === my) setVstate({ phase: 'failed', msg: e.message }) }
  }
  const read = async (f = file) => {
    const my = ++runRef.current
    setBusy(true); setErr(''); setConfirmed(false); setVstate(null)
    try {
      const out = await extractRows(f)
      if (runRef.current !== my) return
      const st = toSteps(out.rows, Number(year)); setAiWarn(out.warnings); setSteps(st); if (casino) fillFor(casino, st)
      setBusy(false)
      if (verify) runVerify(f, out.rows, my)
    } catch (e) { if (runRef.current === my) { setErr(e.message); setBusy(false) } }
  }
  const skipVerify = () => { runRef.current++; setVstate({ phase: 'skipped' }) }
  const upd = (id, p) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, ...p, uncertain: p.title === undefined && p.label === undefined && p.date === undefined && p.time === undefined ? x.uncertain : false } : x)))

  const calc = useMemo(() => {
    if (!steps) return null
    const withMs = steps.map((s) => ({ ...s, ms: toMs(s.date, s.time) }))
    const valid = validateReview(withMs)
    const ok = withMs.filter((s) => s.ms != null)
    const gapped = withGaps(ok)
    const gapOf = Object.fromEntries(gapped.map((g) => [g.id, g.gap]))
    return { withMs, gapOf, ...valid, summary: summaryOf(ok) }
  }, [steps])

  const verifying = vstate && (vstate.phase === 'wait' || vstate.phase === 'read')
  const blocked = !calc || calc.errors.length > 0 || !confirmed || verifying
  const download = (flow) => {
    const list = calc.withMs.filter((s) => s.flow === flow)
    const rows = withGaps(list)
    const doc = buildSequencePdf({
      meta: { ...meta, title: meta.title || (meta.casino.split(' ')[0] || 'SEQUENCE'), casino: meta.casino, workflow: meta.workflow || meta.casino, generated: todayText() },
      rows, summary: calc.summary ? { totalText: calc.summary.totalText, from: calc.summary.from, to: calc.summary.to } : null,
    })
    doc.save(`${(meta.casino || 'sequence').replace(/\s+/g, '-')}-${flow === 'Activation' ? 'Act' : 'Rem'}.pdf`)
  }
  const downloadBoth = () => { download('Activation'); setTimeout(() => download('Reminder'), 500) }
  const nAct = calc?.withMs.filter((s) => s.flow === 'Activation').length || 0, nRem = calc?.withMs.filter((s) => s.flow === 'Reminder').length || 0

  return (
    <div>
      <div className="au-grid">
        <div className={`au-drop ${file ? 'has' : ''}`}>
          <div className="au-drop-h"><b>Larawan ng sequence</b>{file && <button className="x" onClick={() => { setFile(null); setSteps(null); setUrl('') }}>✕</button>}</div>
          {!file ? (
            <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}>
              Click o i-drop dito ang larawan<small>Screenshot ng mga subitem (Subitem, Label, Date, Time)</small>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
            </label>
          ) : (
            <div className="au-info"><div className="au-file">🖼 {file.name}</div>
              <label className="au-year">Taon ng petsa<input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></label>
              <small className="muted">Walang taon sa larawan, kaya ilagay ang tamang taon.</small>
              <label className="au-verify"><input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} /> Basahin nang dalawang beses para sigurado <small>(ang ikalawa ay sa loob ng 1 minuto; ang hindi magkatugma ay mamarkahan)</small></label>
              {busy && <div className="muted">Binabasa ng AI ang larawan...</div>}
              {!busy && (steps || err) && <button className="ghost" onClick={() => read()}>Basahin ulit</button>}
            </div>
          )}
        </div>
        <div className="au-drop">
          <div className="au-drop-h"><b>Paano ito gumagana</b></div>
          <ol className="au-how"><li>I-upload ang <b>isang larawan</b> lang.</li><li>Awtomatiko itong babasahin, kokompyutin ang Gap, at hahatiin sa <b>Activation</b> at <b>Reminder</b>.</li><li><b>Susuriin mo</b> ang resulta katabi ng larawan.</li><li>Pagkatapos mong kumpirmahin, gagawa ng dalawang PDF.</li></ol>
        </div>
      </div>
      {err && <div className="error">⚠ {err}</div>}

      {steps && calc && (
        <>
          <section className="d-card">
            <h3>Mga detalye ng PDF</h3>
            <div className="au-form">
              <label className="wide">Casino (mula sa mga task mo)
                <select value={casino} onChange={(e) => { setCasino(e.target.value); fillFor(e.target.value) }}>
                  <option value="">— pumili —</option>
                  {casinos.map((c) => <option key={c}>{c}</option>)}
                </select>
                <small>Awtomatikong pupunan ang Pamagat, Casino at Workflow. Puwede mo pa ring baguhin.</small></label>
              <label>Pamagat (hal. SOBOBA)<input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
              <label>Casino / Campaign<input value={meta.casino} onChange={(e) => setMeta({ ...meta, casino: e.target.value })} placeholder="hal. SOBOBA CONTINUITY OCTOBER" /></label>
              <label>Assigned To<input value={meta.assignedTo} onChange={(e) => setMeta({ ...meta, assignedTo: e.target.value })} /></label>
              <label>Organization<input value={meta.organization} onChange={(e) => setMeta({ ...meta, organization: e.target.value })} /></label>
              <label>Campaign Dates<input value={meta.campaignDates} onChange={(e) => setMeta({ ...meta, campaignDates: e.target.value })} /></label>
              <label>Workflow<input value={meta.workflow} onChange={(e) => setMeta({ ...meta, workflow: e.target.value })} placeholder="hal. SOBOBA - OCTOBER Gifting Activate/Reminder Automated" /></label>
            </div>
          </section>

          <section className="d-card">
            <h3>Suriin ang resulta <small>{steps.length} steps · {nAct} Activation · {nRem} Reminder</small></h3>
            {calc.errors.map((m, i) => <div key={i} className="au-bad">⛔ {m}</div>)}
            {vstate && vstate.phase === 'wait' && <div className="rv-verify">⏳ Sinusuri ng ikalawang pagbasa sa <b>{vstate.left}s</b> (para sa paghahambing). Puwede ka nang magsuri sa ngayon; hindi pa magagamit ang download. <button className="link" onClick={skipVerify}>Laktawan</button></div>}
            {vstate && vstate.phase === 'read' && <div className="rv-verify">⏳ Binabasa ang larawan sa ikalawang pagkakataon... <button className="link" onClick={skipVerify}>Laktawan</button></div>}
            {vstate && vstate.phase === 'done' && !vstate.diffs && !vstate.warnings.length && <div className="au-ok">✓ Magkatugma ang dalawang magkahiwalay na pagbasa ng AI.</div>}
            {vstate && vstate.phase === 'done' && vstate.diffs > 0 && <div className="au-warn">⚠ May {vstate.diffs} row na magkaiba ang dalawang pagbasa. Naka-highlight ang mga ito; suriin sa larawan.</div>}
            {vstate && vstate.phase === 'done' && vstate.warnings.map((m, i) => <div key={'vw' + i} className="au-warn">⚠ {m}</div>)}
            {vstate && vstate.phase === 'failed' && <div className="au-warn">⚠ Hindi gumana ang ikalawang pagbasa ({vstate.msg}). Walang paghahambing, kaya suriing mabuti ang bawat row.</div>}
            {vstate && vstate.phase === 'skipped' && <div className="au-warn">⚠ Nilaktawan ang ikalawang pagbasa. Suriing mabuti ang bawat row.</div>}
            {aiWarn.map((m, i) => <div key={'ai' + i} className="au-warn">⚠ {m}</div>)}
            {calc.warnings.map((m, i) => <div key={i} className="au-warn">⚠ {m}</div>)}
            {!calc.errors.length && !calc.warnings.length && !aiWarn.length && !vstate && <div className="au-ok">✓ Walang nakitang problema sa pagkakasunod-sunod ng petsa.</div>}
            <div className="rv-split">
              <div className={`rv-img ${zoom ? 'zoom' : ''}`} onClick={() => setZoom(!zoom)} title="I-click para palakihin o paliitin"><img src={url} alt="sequence" /></div>
              <div className="rv-groups">
                {['Activation', 'Reminder'].map((flow) => {
                  const list = calc.withMs.filter((s) => s.flow === flow)
                  return (
                    <div key={flow} className="rv-group">
                      <div className="rv-gh">
                        <b className={`fl ${flow}`}>{flow}</b>
                        <span className="muted">{flow === 'Activation' ? 'Warm Up, Full Seq, Special Text' : 'Call Reminder, Text Reminder'} · {list.length} steps</span>
                        <button className="primary" disabled={blocked || !list.length} onClick={() => download(flow)}>⬇ {flow} PDF</button>
                      </div>
                      <div className="rv-table">
                        <div className="rv-r h"><span>#</span><span>Flow</span><span>Subitem</span><span>Label</span><span>Date</span><span>Time</span><span>Gap</span><span /></div>
                        {!list.length && <div className="rv-empty">Walang {flow} step na nakita.</div>}
                        {list.map((s, i) => (
                          <div key={s.id} className={`rv-r ${s.uncertain ? 'unsure' : ''}`}>
                            <span>{i + 1}</span>
                            <select className={`fl ${s.flow}`} value={s.flow} onChange={(e) => upd(s.id, { flow: e.target.value })} title="Ilipat sa kabilang PDF"><option value="Activation">Act</option><option value="Reminder">Rem</option></select>
                            <input value={s.title} onChange={(e) => upd(s.id, { title: e.target.value })} />
                            <input value={s.label} onChange={(e) => upd(s.id, { label: e.target.value })} />
                            <input type="date" value={s.date} onChange={(e) => upd(s.id, { date: e.target.value })} />
                            <input type="time" value={s.time} onChange={(e) => upd(s.id, { time: e.target.value })} />
                            <span className="gp">{calc.gapOf[s.id] == null ? '—' : formatGapPdf(calc.gapOf[s.id])}</span>
                            <button className="x" title="Alisin ang row" onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {calc.summary && <div className="rv-sum"><b>Workflow Gap Summary</b> · Total Gap: <b>{calc.summary.totalText}</b> · From: {calc.summary.from} → To: {calc.summary.to}</div>}
          </section>

          <section className="d-card">
            <label className="rv-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Nasuri ko na ang bawat row laban sa larawan, at tama ang mga pangalan, petsa at oras.</label>
            <div className="au-act">
              <button className="primary" disabled={blocked || !nAct || !nRem} onClick={downloadBoth}>⬇ Download pareho (Activation + Reminder)</button>
              <button className="ghost" disabled={blocked || !nAct} onClick={() => download('Activation')}>Activation lang</button>
              <button className="ghost" disabled={blocked || !nRem} onClick={() => download('Reminder')}>Reminder lang</button>
              {verifying && <span className="muted">Hintayin ang ikalawang pagbasa, o i-click ang Laktawan.</span>}
              {!verifying && !confirmed && !calc.errors.length && <span className="muted">Lagyan muna ng tsek sa itaas.</span>}
              {calc.errors.length > 0 && <span className="muted">Ayusin muna ang mga ⛔.</span>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
