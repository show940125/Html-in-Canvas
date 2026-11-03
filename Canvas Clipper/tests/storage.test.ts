import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { currentProject, getProject, updateProject } from '../src/storage';
import { createClip, validateCapture } from '../src/model';
describe('persistent atomic updates', () => {
  it('creates one default project for concurrent first operations', async () => { const [a, b] = await Promise.all([currentProject(), currentProject()]); expect(a.id).toBe(b.id); });
  it('merges an incoming capture and an editor change without dropping either', async () => {
    const p = await currentProject();
    const c = createClip(validateCapture({ kind: 'manual', text: '保留原文', title: '測試', url: '', capturedAt: new Date().toISOString() }), 0);
    await Promise.all([
      updateProject(p.id, v => ({ ...v, cards: [...v.cards, c] })),
      updateProject(p.id, v => ({ ...v, title: '改過的名稱' })),
    ]);
    const saved = await getProject(p.id);
    expect(saved?.title).toBe('改過的名稱'); expect(saved?.cards.some(card => card.id === c.id)).toBe(true);
  });
});
