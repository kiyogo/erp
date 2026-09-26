import { SelectionPageRect, CaretGeometry } from '../hit-testing/hit-tester';
import { hexToRgba } from '../utils/color';

export interface RemoteCollaboratorPresence {
  userId: string;
  name: string;
  color: string;
  caret?: CaretGeometry | null;
  selectionRects?: SelectionPageRect[];
}

export interface FindHighlight {
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  isActive?: boolean;
}

export class InteractionRenderer {
  /**
   * Renders transient UI (selection, blinking caret, remote presence, find highlights) on the interaction canvas
   */
  public static renderInteractionLayer(
    canvas: HTMLCanvasElement,
    pageIndex: number,
    pageWidth: number,
    pageHeight: number,
    options: {
      selectionRects: SelectionPageRect[];
      caret: CaretGeometry | null;
      isCaretVisible: boolean;
      collaborators: RemoteCollaboratorPresence[];
      findHighlights?: FindHighlight[];
      dpr?: number;
    }
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(options.dpr || window.devicePixelRatio || 1, 1.5);

    if (canvas.width !== Math.round(pageWidth * dpr) || canvas.height !== Math.round(pageHeight * dpr)) {
      canvas.width = Math.round(pageWidth * dpr);
      canvas.height = Math.round(pageHeight * dpr);
    }
    canvas.style.width = `${pageWidth}px`;
    canvas.style.height = `${pageHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, pageWidth, pageHeight);

    // 1. Search Highlights
    if (options.findHighlights) {
      for (const h of options.findHighlights) {
        if (h.pageIndex === pageIndex) {
          ctx.fillStyle = h.isActive ? 'rgba(255, 152, 0, 0.55)' : 'rgba(255, 235, 59, 0.45)';
          ctx.fillRect(h.rect.x, h.rect.y, h.rect.width, h.rect.height);
          if (h.isActive) {
            ctx.strokeStyle = '#E65100';
            ctx.lineWidth = 1;
            ctx.strokeRect(h.rect.x, h.rect.y, h.rect.width, h.rect.height);
          }
        }
      }
    }

    // 2. Remote Collaborator Selections
    for (const collab of options.collaborators) {
      if (collab.selectionRects) {
        const collabFill = hexToRgba(collab.color || '#0F6CBD', 0.22);
        ctx.fillStyle = collabFill;
        for (const sr of collab.selectionRects) {
          if (sr.pageIndex === pageIndex) {
            ctx.fillRect(sr.rect.x, sr.rect.y, sr.rect.width, sr.rect.height);
          }
        }
      }
    }

    // 3. Local Selection Highlights
    const pageSelections = options.selectionRects;
    if (pageSelections.length > 0) {
      ctx.fillStyle = 'rgba(180, 215, 255, 0.45)'; // Google Docs selection blue
      for (const s of pageSelections) {
        ctx.fillRect(s.rect.x, s.rect.y, s.rect.width, s.rect.height);
      }
    }

    // 4. Remote Collaborator Carets & Name Badges
    for (const collab of options.collaborators) {
      if (collab.caret && collab.caret.pageIndex === pageIndex) {
        const c = collab.caret;
        const color = collab.color || '#0F6CBD';

        // Colored vertical line
        ctx.fillStyle = color;
        ctx.fillRect(c.x, c.y, 2, c.height);

        // Collaborator Name Tag
        if (collab.name) {
          ctx.font = 'bold 9pt Arial, sans-serif';
          const nameWidth = ctx.measureText(collab.name).width;
          const tagW = nameWidth + 8;
          const tagH = 16;
          const tagX = Math.max(2, c.x - 2);
          const tagY = Math.max(2, c.y - tagH);

          // Tag background
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(tagX, tagY, tagW, tagH, [3, 3, 3, 0]);
          ctx.fill();

          // Tag text
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(collab.name, tagX + 4, tagY + 12);
        }
      }
    }

    // 5. Local Caret (blinking vertical line)
    if (options.isCaretVisible && options.caret && options.caret.pageIndex === pageIndex) {
      const c = options.caret;
      ctx.fillStyle = '#1A73E8'; // Crisp Docs blue caret
      ctx.fillRect(c.x, c.y, 1.8, c.height);
    }
  }
}
