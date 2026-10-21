// Full-page centered loader, same look as the one in index.html so a refresh never flashes.
export default function PageLoading({ text = 'Loading' }) {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <svg className="spark" viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
        <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="shimmer">{text}</span>
    </div>
  )
}
