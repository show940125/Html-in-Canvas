import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
function Popup() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function invoke(type: string) {
    setBusy(true); setError('');
    try {
      if (!chrome?.runtime?.id) throw new Error('請先在 Chrome 載入擴充功能。');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.runtime.sendMessage({ type, tabId: tab?.id });
      if (!response?.ok) throw new Error(response?.error || '操作未完成。');
      window.close();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div className="popup"><div className="brand"><span className="brand-symbol">C<span>↗</span></span><div><strong>Canvas Clipper</strong><span>摘錄整理台</span></div></div><h1>留下文字，接住想法。</h1><p>從目前網頁開始，建立你的閱讀筆記。</p><button className="button-primary" disabled={busy} onClick={() => void invoke('CAPTURE_ARTICLE')}>{busy ? '處理中…' : '匯入目前文章'} <span>↗</span></button><button className="button-light" disabled={busy} onClick={() => void invoke('OPEN_WORKSPACE')}>開啟整理台</button>{error && <p className="popup-error" role="alert">{error}</p>}<footer>也可以選取文字，按右鍵加入摘錄。</footer></div>;
}
createRoot(document.getElementById('root')!).render(<Popup />);
