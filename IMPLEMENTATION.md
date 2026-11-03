# Canvas Clipper v0.3 implementation

Approved: public show940125/Html-in-Canvas, Apache-2.0. Preserve local installed dist and extension key. v0.2 baseline has an unfinished native optional-origin permission test; it is not a completed release.

- [x] Public reproducible baseline, sanitized docs, synthetic fixtures, CI, repo creation.
- [x] v3 styles/sizes/progress model, v1/v2 backup and database compatibility.
- [x] Pure magnetic preview engine, local collision push, atomic undo.
- [x] Native board preview, resizing, focus/trace, diagnostics.
- [x] Collapsible panels, six palettes, light/dark/system and custom accent.
- [x] Composite PNG/JPEG export with links and shapes.
- [x] Rich document pagination, saved anchors, live HTML WebGL book turns.
- [ ] Standalone documented examples, usage guide, feature video.
- [ ] Native/DOM/150% DPI, migration, export, pagination, performance checks.
- [x] Real origin permission download/offline/SVG rejection; preserve manual consent boundary.
- [ ] Clean clone build, package, release, evidence and user preview.

## Decisions

Magnetic layout preserves spatial intent; neighboring groups locally yield. Group styles are inherited by cards with optional overrides. Long articles paginate as a book. Preview is transient; dropping commits one reversible action. Keep document outline independent of spatial arrangement. Readable HTML/CSS PDF is separate from raster output. Shared layer owns browser APIs only.

Next: strengthen native/DOM pagination and drag acceptance, fix theme contrast and viewport anchoring, then examples/docs/permission closure/clean-clone/release.

Current evidence: `Canvas Clipper/output/v03/acceptance.json` passes the first integrated flow (17 checks); 37 unit tests passed before UI integration. Native GL initially failed shader precision linkage and was corrected; latest flow renders HTML textures and advances pages. Source changes are not yet pushed as v0.3.

Checkpoint: 42 unit tests and type/build pass. `output/v03/images/image-acceptance.json`: all five real headed extension checks pass (grant/download/raster storage/offline reload/SVG rejection). Deep 150% acceptance has passed native shapes/input/resize, cancellation, local neighbor yielding, collapsed hover, pagination character equality and GPU text selection. Its first link test exposed DOMPurify removing target=_blank; ADD_ATTR target/rel now fixed. Current terminal session 47158 is the rerun; wait it before launching duplicates.

Important fix: useWorkspace async load now re-reads after setCurrent and guards editEpoch/pending edits; stale hash loads previously overwrote the current view after import. CSS resize button specificity also fixed (full-width relative button was causing negative drags).

Next: finish deep suite, examples/docs/film, portable workload + migration + extension acceptance, CI browser job, clean clone, release. Source currently local v0.3; remote still baseline.
