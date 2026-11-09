import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { currentProject, listProjects } from './storage';
import type { Project } from './model';
import './styles.css';
import './popup-workbench.css';
function Popup() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [projects, setProjects] = useState<Project[]>([]), [projectId, setProjectId] = useState(''), [loading, setLoading] = useState(true);
  const [captured, setCaptured] = useState<{projectId:string;projectTitle:string;clipId:string}>();
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const active = await currentProject(), rows = await listProjects();
      if (!disposed) { setProjects(rows); setProjectId(active.id); }
    })().catch(e => { if (!disposed) setError(e instanceof Error ? e.message : String(e)); }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, []);
  async function invoke(type: string) {
    setBusy(true); setError('');
    try {
      if (!globalThis.chrome?.runtime?.id) throw new Error('請先在 Chrome 載入擴充功能。');
      const message = type === 'CAPTURE_ARTICLE'
        ? { type, tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id, projectId, openAfterCapture: false }
        : type === 'OPEN_CAPTURED_CLIP' && captured ? { type, projectId: captured.projectId, clipId: captured.clipId } : { type };
      const response = await chrome.runtime.sendMessage(message);
      if (!response?.ok) throw new Error(response?.error || '操作未完成。');
      if (type === 'CAPTURE_ARTICLE') setCaptured({ projectId: response.projectId, projectTitle: response.projectTitle, clipId: response.clipId });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div className="popup"><div className="brand"><span className="brand-symbol">C<span>↗</span></span><div><strong>Canvas Clipper</strong><span>摘錄整理台</span></div></div><h1>收集目前文章</h1><p>保留原文，整理自己的想法。</p><label className="popup-destination">加入專案<select aria-label="收集目的專案" disabled={busy || loading} value={projectId} onChange={e => { setProjectId(e.target.value); setCaptured(undefined); }}>{loading ? <option value="">正在讀取專案…</option> : projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>{captured ? <div className="popup-success"><p role="status">已加入「{captured.projectTitle}」。</p><button className="button-primary" disabled={busy} onClick={() => void invoke('OPEN_CAPTURED_CLIP')}>查看剛加入的材料 <span>↗</span></button></div> : <button className="button-primary" disabled={busy || loading || !projectId} onClick={() => void invoke('CAPTURE_ARTICLE')}>{busy ? '正在收集…' : '匯入目前文章'} <span>↗</span></button>}<button className="button-light" disabled={busy} onClick={() => void invoke('OPEN_WORKSPACE')}>開啟整理台</button>{error && <p className="popup-error" role="alert">{error}</p>}<footer>也可以選取文字，按右鍵加入摘錄。</footer></div>;
}
createRoot(document.getElementById('root')!).render(<Popup />);
