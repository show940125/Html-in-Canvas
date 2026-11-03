import { describe, expect, it } from 'vitest';
import { createClip, exportProject, importProject, MAX_TEXT, newProject, safeUrl, validateCapture } from '../src/model';
const capture = () => validateCapture({ kind: 'selection', title: '測試文章', text: '原文第一段。\r\n\r\n原文第二段。', url: 'https://example.com/article', capturedAt: '2026-11-01T01:00:00Z' });
describe('capture trust boundary', () => {
  it('normalizes line endings and preserves paragraphs', () => expect(capture().text).toBe('原文第一段。\n\n原文第二段。'));
  it.each([null, {}, { ...capture(), text: '' }, { ...capture(), capturedAt: 'invalid' }, { ...capture(), kind: 'script' }, { ...capture(), text: 'x'.repeat(MAX_TEXT + 1) }, { ...capture(), url: 'javascript:alert(1)' }])('rejects invalid capture %#', value => expect(() => validateCapture(value)).toThrow());
  it('does not turn markup into executable content', () => { const value = validateCapture({ ...capture(), text: '<img src=x onerror=alert(1)>' }); expect(createClip(value, 0).workingText).toBe(value.text); });
  it('accepts only web source links', () => { expect(safeUrl('file:///C:/secret')).toBe(''); expect(safeUrl('data:text/html,bad')).toBe(''); expect(safeUrl('https://example.com')).toBe('https://example.com/'); });
});
describe('project backups', () => {
  it('round-trips text, notes, positions, view and order into a new identity', () => {
    const p = newProject('研究'); const a = createClip(capture(), 0), b = createClip(capture(), 1);
    p.cards = [{ ...b, note: '我的觀點', workingText: '編輯後', x: -12, y: 47 }, a];
    p.view = { x: -100, y: 20, zoom: 1.5 }; p.print = { fontSize: 14, lineHeight: 1.8, includeGraph: true };
    const restored = importProject(exportProject(p));
    expect(restored.id).not.toBe(p.id); expect(restored.cards[0].id).not.toBe(b.id);
    expect(restored.cards.map(c => c.originalText)).toEqual(p.cards.map(c => c.originalText));
    expect(restored.cards[0]).toMatchObject({ note: '我的觀點', workingText: '編輯後', x: -12, y: 47 });
    expect(restored.view).toEqual(p.view); expect(restored.print).toEqual(p.print);
  });
  it('retains empty edited text', () => { const p = newProject(); p.cards = [{ ...createClip(capture(), 0), workingText: '' }]; expect(importProject(exportProject(p)).cards[0].workingText).toBe(''); });
  it('rejects unknown versions and malformed JSON', () => { expect(() => importProject('{')).toThrow(); expect(() => importProject('{"format":"canvas-clipper","version":99}')).toThrow(); });
  it('rejects duplicate ids atomically', () => { const p = newProject(); const c = createClip(capture(), 0); p.cards = [c, c]; expect(() => importProject(exportProject(p))).toThrow(/重複/); });
  it('rejects invalid coordinates and unsupported print options', () => { const p = newProject(); p.cards = [{ ...createClip(capture(), 0), x: Infinity }]; expect(() => importProject(exportProject(p))).toThrow(); p.cards = []; p.print.fontSize = 0; expect(() => importProject(exportProject(p))).toThrow(); });
});
