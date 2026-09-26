# KIYOVN Canvas Document Editor Architecture

## I. Executive Summary & Design Philosophy

The **KIYOVN Canvas Document Editor** is a browser-based word processing engine designed from the ground up to provide word-processor interaction fidelity and layout consistency comparable to modern document suites (such as Google Docs).

### Core Architectural Principle: Canvas-Based Document Surface
Unlike traditional browser text editors that rely on HTML `contenteditable` (e.g. ProseMirror, TipTap, Quill, Lexical), the visible editing surface of the KIYOVN Document Editor is **primarily rendered by HTML5 2D Canvas**.

- **Why Canvas over DOM/contenteditable?**
  1. **Strict WYSIWYG Print & PDF Consistency**: Browser DOM layout engines vary across OS and browser vendors (rendering differences in line heights, subpixel kerning, and word wrapping). Canvas gives complete mathematical control over glyph positions, page dimensions, margins, and pagination.
  2. **Deterministic Pagination**: Real multi-page word processing with pagination breaks, headers/footers, and margins cannot be achieved reliably in contenteditable DOM without brittle workarounds.
  3. **High Performance**: Renders large multi-page documents via display lists, page-level virtualization, and dirty-region batching.

---

## II. End-to-End Rendering Pipeline

```
  +-------------------------------------------------------------------------+
  |                              USER INPUT                                 |
  | (Keyboard / IME Telex/VNI / Pointer / Clipboard / Collaborative Events) |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                         TEXT INPUT CONTROLLER                           |
  |     - EditContext API modern path & offscreen input bridge              |
  |     - CompositionManager for Vietnamese/CJK IME                         |
  |     - KeyboardController & PointerController                            |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                           COMMAND REGISTRY                              |
  |       - Decouples UI buttons / hotkeys from document mutations          |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                          TRANSACTION ENGINE                             |
  |  - Atomic Operations: insert-text, delete-range, split-paragraph, etc.  |
  |  - Automatic inverse operation computation for Undo/Redo                |
  |  - HistoryManager with intelligent typing grouping                      |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                            DOCUMENT MODEL                               |
  |  - Structured Document: blocks (paragraphs, headings, lists, tables)    |
  |  - Text runs with marks (font, size, bold, italic, color, links)        |
  |  - Settings (PageSize, Margins, Orientation, PageColor)                 |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                         CUSTOM LAYOUT ENGINE                            |
  |  - FontMetricsService: Aggressive measurement caching                   |
  |  - Unicode LineBreaker: Intl.Segmenter / Grapheme cluster wrapping      |
  |  - Multi-page pagination engine with margins and overflow calculation   |
  |  - Table & image layout calculation                                     |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                       LAYOUT IR & DISPLAY LIST                          |
  |  - DocumentLayout -> PageLayout[] (contentRect, blocks, lines, runs)    |
  |  - HitTestEntry[]: Fast binary search index for pointer hit-testing     |
  |  - PaintCommand[]: Serialized vector commands (rect, text, line, image) |
  +------------------------------------+------------------------------------+
                                       |
                                       v
  +-------------------------------------------------------------------------+
  |                       DUAL-LAYER CANVAS RENDERER                        |
  |  [Layer 1] Base Content Canvas: Document text, images, tables, rules    |
  |  [Layer 2] Interaction Canvas: Caret (blinking), local/remote selection |
  |            highlights, collaborator presence badges, search markers     |
  +-------------------------------------------------------------------------+
```

---

## III. Dual-Layer Canvas Rendering System

Each page in the document is rendered using two stacked `<canvas>` elements inside a physical paper container:

1. **Base Content Canvas (`doc-base-canvas`)**:
   - Executes the pre-compiled `DisplayList` for that page.
   - Paints background paper color, table borders, cell fills, horizontal rules, text runs, and embedded images.
   - Only repaints when document content or layout changes.

2. **Interaction Overlay Canvas (`doc-interaction-canvas`)**:
   - Paints transient and interactive UI elements:
     - Local selection rectangles (semi-transparent blue `#C2E7FF` / `rgba(180, 215, 255, 0.45)`).
     - Local Caret (blinking vertical cursor, 1.8px thickness, `#1A73E8`).
     - Remote Collaborator Selections (unique color per user, e.g. green, orange, purple).
     - Remote Collaborator Carets & Name Badges (hovering pill tag with user name).
     - Find & Replace match highlights.
   - Captures pointer events (`pointerdown`, `pointermove`, `pointerup`) with subpixel accuracy.

### High-DPI (Retina) Scaling
All canvases dynamically account for `window.devicePixelRatio`:
```typescript
canvas.width = Math.round(cssWidth * dpr);
canvas.height = Math.round(cssHeight * dpr);
canvas.style.width = `${cssWidth}px`;
canvas.style.height = `${cssHeight}px`;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
```

---

## IV. Hit-Testing, Selection & Caret Geometry

### Stable Document Position
Logical positions in the document are represented by a stable `DocPosition`:
```typescript
export interface DocPosition {
  blockId: string;
  offset: number; // Character offset in block
  affinity?: 'forward' | 'backward';
}
```

### Binary Search Hit Testing
When the user clicks or drags on a canvas page:
1. The `HitTester` maps physical canvas coordinates `(x, y)` to logical document points `(docX, docY) / zoom`.
2. Locates the line containing `docY`.
3. Performs a fast **binary search** across the line's `PositionedCluster` records:
   - If pointer `x` is closer to the right edge of a grapheme cluster, the offset is cluster offset + cluster length.
   - Accurately supports multi-byte Unicode, Vietnamese accents, and emojis.

### Vertical Navigation & Preferred Caret X
When pressing `ArrowUp` or `ArrowDown`, the editor maintains `preferredCaretX`:
- As the cursor navigates lines of varying lengths, `preferredCaretX` preserves the horizontal target column, matching native desktop word processors.

---

## V. Input Architecture & Vietnamese IME Support

1. **Hidden Input Bridge & EditContext API**:
   - An offscreen `<textarea>` is positioned and focused to receive native input, mobile keyboards, and IME events.
2. **Vietnamese Telex & VNI IME Composition**:
   - During `compositionstart` and `compositionupdate`, typing accumulates in the `CompositionManager`.
   - On `compositionend`, the completed word is committed to the DocumentModel as an atomic transaction.
3. **Grapheme & Word Jumps**:
   - `Ctrl/Cmd + Left/Right` jumps full words using `Intl.Segmenter`.
   - `Backspace` and `Delete` are grapheme-cluster aware and never slice combining diacritics into broken surrogate pairs.

---

## VI. History & Intelligent Undo Grouping

- All document mutations are applied as `EditorTransaction` containing `EditorOperation[]`.
- Each operation computes its exact inverse operation.
- **Typing Debouncing**:
  - Consecutive character keystrokes within 1000ms merge into a single undo group.
  - Groups break on cursor jumps, formatting changes, enter, backspace/delete direction shifts, or paste.

---

## VII. Backend Architecture & Realtime Collaboration

### Database Schema (SQLite in `server/index.mjs`)
1. `documents`: `id`, `owner_id`, `title`, `current_revision`, `settings_json`, `deleted_at`, `created_at`, `updated_at`.
2. `document_members`: `id`, `document_id`, `user_id`, `role` (`owner`, `editor`, `commenter`, `viewer`), `created_at`.
3. `document_snapshots`: `id`, `document_id`, `revision`, `data`, `created_at`.
4. `document_operations`: `id`, `document_id`, `revision`, `client_id`, `transaction_id`, `data`, `created_at`.
5. `document_comments`: `id`, `document_id`, `author_id`, `anchor_data`, `body`, `resolved`, `created_at`, `updated_at`.

### Realtime Synchronization Protocol
- **Server-Sent Events (SSE)**: Streamed at `GET /api/v1/documents/:id/events` for real-time operation broadcasts and presence.
- **Cross-Tab BroadcastChannel**: Synchronizes local tabs instantly without network latency.
- **Offline Resilience**: Local transactions queue and persist in IndexedDB / localStorage when offline, automatically resyncing upon reconnection.

---

## VIII. Export & Print Engine

- **High-Fidelity PDF Export**: Uses `pdf-lib` to construct vector PDF pages matching exact dimensions (e.g. A4 `210mm x 297mm`) and margins.
- **Clean Document Print**: Intercepts `Ctrl+P` to generate an isolated print DOM containing purely the canvas document pages with `@page` CSS and no UI chrome.
