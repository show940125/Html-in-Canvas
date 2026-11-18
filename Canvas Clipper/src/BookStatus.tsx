export type BookPhase = 'fonts' | 'images' | 'pages';

const steps = [
  ['fonts', '準備字型'],
  ['images', '準備圖片'],
  ['pages', '安排頁面'],
] as const;

export function BookStatus({phase, error, onRetry, onRead}:{
  phase: BookPhase; error?: string; onRetry: () => void; onRead: () => void;
}) {
  const active = steps.findIndex(([id]) => id === phase);
  return <section className="book-status" aria-labelledby="book-status-title">
    <p className="book-status-kicker">書本閱讀</p>
    <h3 id="book-status-title">{error ? '排頁遇到問題' : '正在準備閱讀'}</h3>
    {error
      ? <><p role="alert">{error}</p><p>閱讀進度已保留。你可以重試，或從原處接著閱讀。</p></>
      : <p role="status">正在{steps[active][1]}</p>}
    <ol aria-label="準備階段">
      {steps.map(([id, label], index) => <li key={id} aria-current={index === active ? 'step' : undefined}>
        <span aria-hidden="true">{index < active ? '✓' : index === active && error ? '!' : index + 1}</span>
        <span>{label}</span>
      </li>)}
    </ol>
    <div className="book-status-actions">
      {error && <button className="button-primary" onClick={onRetry}>重試排頁</button>}
      <button className="button-light" onClick={onRead}>改用一般閱讀</button>
    </div>
  </section>;
}
