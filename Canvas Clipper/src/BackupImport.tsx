import { useRef, useState, type DragEvent } from 'react';

export interface ImportFeedback {
  phase: 'checking' | 'complete' | 'error';
  name: string;
  message: string;
  firstId?: string;
}

export function BackupImport({disabled, result, onFile, onOpen}:{
  disabled: boolean;
  result?: ImportFeedback;
  onFile: (file: File) => void;
  onOpen: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function drop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }
  return <section className="backup-import" aria-labelledby="backup-import-title">
    <h3 id="backup-import-title">匯入備份</h3>
    <div className="backup-drop" data-dragging={dragging} aria-busy={result?.phase === 'checking'}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; if (!disabled) setDragging(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={drop}>
      <p>將一個 Canvas Clipper 備份拖到這裡</p>
      <small>ZIP 或舊版 JSON · 匯入會建立專案副本</small>
      <button className="button-light" disabled={disabled} onClick={() => input.current?.click()}>選擇檔案</button>
      <input ref={input} hidden type="file" accept=".json,.zip,application/json,application/zip" onChange={e => {
        const file = e.currentTarget.files?.[0];
        e.currentTarget.value = '';
        if (file && !disabled) onFile(file);
      }}/>
    </div>
    {result && <div className={'import-result '+result.phase} data-import-phase={result.phase}>
      <strong>{result.name}</strong>
      <p role={result.phase === 'error' ? 'alert' : 'status'}>{result.message}</p>
      {result.firstId && <button className="button-primary" onClick={() => onOpen(result.firstId!)}>開啟匯入專案</button>}
    </div>}
  </section>;
}
