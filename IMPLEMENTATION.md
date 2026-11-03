# Canvas Clipper v0.3 implementation

Approved: public show940125/Html-in-Canvas, Apache-2.0. Preserve local installed dist and extension key. v0.2 baseline has an unfinished native optional-origin permission test; it is not a completed release.

- [ ] Public reproducible baseline, sanitized docs, synthetic fixtures, CI, repo creation.
- [ ] v3 styles/sizes/progress model, v1/v2 backup and database compatibility.
- [ ] Pure magnetic preview engine, local collision push, atomic undo.
- [ ] Native board preview, resizing, focus/trace, diagnostics.
- [ ] Collapsible panels, six palettes, light/dark/system and custom accent.
- [ ] Composite PNG/JPEG export with links and shapes.
- [ ] Rich document pagination, saved anchors, live HTML WebGL book turns.
- [ ] Standalone documented examples, usage guide, feature video.
- [ ] Native/DOM/150% DPI, migration, export, pagination, performance checks.
- [ ] Real origin permission download/offline/SVG rejection; preserve manual consent boundary.
- [ ] Clean clone build, package, release, evidence and user preview.

## Decisions

Magnetic layout preserves spatial intent; neighboring groups locally yield. Group styles are inherited by cards with optional overrides. Long articles paginate as a book. Preview is transient; dropping commits one reversible action. Keep document outline independent of spatial arrangement. Readable HTML/CSS PDF is separate from raster output. Shared layer owns browser APIs only.

Next: prepare sanitized public baseline, then implement data and layout.
