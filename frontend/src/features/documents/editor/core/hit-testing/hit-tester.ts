import { DocumentLayout, PageLayout, HitTestEntry, Rect, PositionedCluster } from '../layout/layout-types';
import { DocPosition, EditorSelection, normalizeSelection } from '../selection/position';
import { DocumentModel } from '../model/document-model';

export interface CaretGeometry {
  pageIndex: number;
  x: number;
  y: number;
  height: number;
  baseline: number;
}

export interface SelectionPageRect {
  pageIndex: number;
  rect: Rect;
}

export class HitTester {
  private static getXForOffset(entry: HitTestEntry, offset: number, fallback: number): number {
    if (entry.clusters.length === 0) return fallback;
    if (offset <= entry.startOffset) return entry.rect.x;
    if (offset >= entry.endOffset) {
      const last = entry.clusters[entry.clusters.length - 1];
      return last.x + last.width;
    }

    for (const cl of entry.clusters) {
      const clStart = cl.offsetInBlock;
      const clEnd = cl.offsetInBlock + cl.cluster.length;
      if (offset >= clStart && offset <= clEnd) {
        const fraction = cl.cluster.length > 0 ? (offset - clStart) / cl.cluster.length : 0;
        return cl.x + cl.width * Math.max(0, Math.min(1, fraction));
      }
    }

    return fallback;
  }

  /**
   * Hit test a physical point (in logical document coordinates) on a specific page.
   * Returns precise DocPosition.
   */
  public static hitTestPoint(
    pageIndex: number,
    x: number,
    y: number,
    layout: DocumentLayout,
    doc: DocumentModel
  ): DocPosition | null {
    const page = layout.pages[pageIndex];
    if (!page || page.blocks.length === 0) {
      const firstBlock = doc.blocks[0];
      return firstBlock ? { blockId: firstBlock.id, offset: 0 } : null;
    }

    // 1. Precise Table Cell Hit Testing
    for (const blk of page.blocks) {
      if (blk.tableLayout) {
        const tbl = blk.tableLayout;
        if (
          x >= tbl.rect.x - 20 &&
          x <= tbl.rect.x + tbl.rect.width + 20 &&
          y >= tbl.rect.y - 8 &&
          y <= tbl.rect.y + tbl.rect.height + 8
        ) {
          let targetRow = tbl.rows.find((r) => y >= r.rect.y && y <= r.rect.y + r.rect.height);
          if (!targetRow && tbl.rows.length > 0) {
            let minRowDist = Infinity;
            for (const r of tbl.rows) {
              const dist = Math.abs(y - (r.rect.y + r.rect.height / 2));
              if (dist < minRowDist) {
                minRowDist = dist;
                targetRow = r;
              }
            }
          }

          if (targetRow) {
            let targetCell = targetRow.cells.find((c) => x >= c.rect.x && x <= c.rect.x + c.rect.width);
            if (!targetCell && targetRow.cells.length > 0) {
              let minCellDist = Infinity;
              for (const c of targetRow.cells) {
                const dist = Math.abs(x - (c.rect.x + c.rect.width / 2));
                if (dist < minCellDist) {
                  minCellDist = dist;
                  targetCell = c;
                }
              }
            }

            if (targetCell) {
              const cellBlocks = targetCell.blocks;
              if (cellBlocks && cellBlocks.length > 0) {
                const cellLines = cellBlocks.flatMap((cb) => cb.lines);
                if (cellLines.length === 0) {
                  return { blockId: cellBlocks[0].blockId, offset: 0 };
                }

                let closestLine = cellLines[0];
                let minLineDist = Infinity;
                for (const line of cellLines) {
                  if (y >= line.rect.y && y <= line.rect.y + line.rect.height) {
                    closestLine = line;
                    break;
                  }
                  const dist = Math.abs(y - (line.rect.y + line.rect.height / 2));
                  if (dist < minLineDist) {
                    minLineDist = dist;
                    closestLine = line;
                  }
                }

                return HitTester.hitTestLineOffset(closestLine, x);
              } else {
                const tblModel = (doc.getBlockById((tbl as any).id || (tbl as any).tableId) || null) as any;
                const rIdx = tbl.rows.findIndex((r) => r.rowId === targetRow?.rowId);
                const cIdx = targetRow?.cells.findIndex((c) => c.cellId === targetCell?.cellId) ?? 0;
                const cellObj = tblModel?.rows[rIdx]?.cells[cIdx];
                if (cellObj && cellObj.blocks && cellObj.blocks.length > 0) {
                  return { blockId: cellObj.blocks[0].id, offset: 0 };
                }
              }
            }
          }
        }
      }
    }

    // 2. Regular paragraphs and top-level block hit testing
    const nonTableLines = page.hitTestIndex.filter((entry) => {
      // Check if entry belongs to a table
      for (const blk of page.blocks) {
        if (blk.tableLayout) {
          for (const row of blk.tableLayout.rows) {
            for (const cell of row.cells) {
              if (cell.blocks.some((cb) => cb.blockId === entry.blockId)) {
                return false;
              }
            }
          }
        }
      }
      return true;
    });

    const candidateEntries = nonTableLines.length > 0 ? nonTableLines : page.hitTestIndex;

    // Find entries overlapping vertically with y
    let matchingEntries = candidateEntries.filter(
      (entry) => y >= entry.rect.y && y <= entry.rect.y + entry.rect.height
    );

    if (matchingEntries.length === 0) {
      let minDist = Infinity;
      let closestY = candidateEntries[0].rect.y;
      for (const entry of candidateEntries) {
        const dist = Math.abs(y - (entry.rect.y + entry.rect.height / 2));
        if (dist < minDist) {
          minDist = dist;
          closestY = entry.rect.y;
        }
      }
      matchingEntries = candidateEntries.filter((entry) => Math.abs(entry.rect.y - closestY) < 4);
    }

    if (matchingEntries.length === 0) {
      matchingEntries = [candidateEntries[0]];
    }

    let targetEntry = matchingEntries[0];
    let bestXDist = Infinity;

    for (const entry of matchingEntries) {
      const entryRight = entry.clusters.length > 0
        ? entry.clusters[entry.clusters.length - 1].x + entry.clusters[entry.clusters.length - 1].width
        : entry.rect.x + entry.rect.width;

      if (x >= entry.rect.x && x <= entryRight) {
        targetEntry = entry;
        break;
      }

      const dist = Math.min(Math.abs(x - entry.rect.x), Math.abs(x - entryRight));
      if (dist < bestXDist) {
        bestXDist = dist;
        targetEntry = entry;
      }
    }

    return HitTester.hitTestLineOffset(targetEntry, x);
  }

  private static hitTestLineOffset(targetEntry: any, x: number): DocPosition {
    const clusters: PositionedCluster[] = targetEntry.clusters || (targetEntry.runs || []).flatMap((r: any) => r.clusters || []);
    if (clusters.length === 0) {
      return { blockId: targetEntry.blockId, offset: targetEntry.startOffset };
    }

    if (x <= targetEntry.rect.x) {
      return { blockId: targetEntry.blockId, offset: targetEntry.startOffset };
    }

    const lastCluster = clusters[clusters.length - 1];
    if (x >= lastCluster.x + lastCluster.width) {
      return { blockId: targetEntry.blockId, offset: targetEntry.endOffset };
    }

    let low = 0;
    let high = clusters.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cl = clusters[mid];
      const clLeft = cl.x;
      const clRight = cl.x + cl.width;

      if (x >= clLeft && x <= clRight) {
        const isCloserToRight = x - clLeft > clRight - x;
        const offset = isCloserToRight
          ? cl.offsetInBlock + cl.cluster.length
          : cl.offsetInBlock;
        return { blockId: targetEntry.blockId, offset };
      }

      if (x < clLeft) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return { blockId: targetEntry.blockId, offset: targetEntry.startOffset };
  }

  /**
   * Get exact CaretGeometry (x, y, height) for a given DocPosition
   */
  public static getCaretGeometry(
    pos: DocPosition | null,
    layout: DocumentLayout,
    doc: DocumentModel,
    pageRange?: { start: number; end: number }
  ): CaretGeometry | null {
    if (!pos) return null;

    // Determine font size of active block to size caret proportionally to text font
    const block = doc.getBlockById(pos.blockId);
    let fontSizePt = 14;
    if (block && 'runs' in block && Array.isArray(block.runs)) {
      const runWithFont = block.runs.find((r) => r.marks && r.marks.fontSize);
      if (runWithFont && runWithFont.marks && runWithFont.marks.fontSize) {
        fontSizePt = runWithFont.marks.fontSize;
      }
    }
    const fontSizePx = (fontSizePt * 96) / 72;
    const caretHeight = Math.max(14, Math.round(fontSizePx * 1.15));

    const pages = pageRange
      ? layout.pages.slice(Math.max(0, pageRange.start), Math.max(pageRange.start, pageRange.end))
      : layout.pages;

    for (const page of pages) {
      for (const entry of page.hitTestIndex) {
        if (entry.blockId === pos.blockId) {
          // Check if offset falls within this line
          if (pos.offset >= entry.startOffset && pos.offset <= entry.endOffset) {
            const caretY = Math.round(entry.baseline - fontSizePx * 0.88);

            // If empty line
            if (entry.clusters.length === 0) {
              return {
                pageIndex: page.pageIndex,
                x: entry.rect.x,
                y: caretY,
                height: caretHeight,
                baseline: entry.baseline,
              };
            }

            // If at end of line
            if (pos.offset === entry.endOffset) {
              const lastCl = entry.clusters[entry.clusters.length - 1];
              return {
                pageIndex: page.pageIndex,
                x: lastCl.x + lastCl.width,
                y: caretY,
                height: caretHeight,
                baseline: entry.baseline,
              };
            }

            // Find matching cluster
            for (let i = 0; i < entry.clusters.length; i++) {
              const cl = entry.clusters[i];
              if (pos.offset >= cl.offsetInBlock && pos.offset <= cl.offsetInBlock + cl.cluster.length) {
                const fraction = cl.cluster.length > 0 ? (pos.offset - cl.offsetInBlock) / cl.cluster.length : 0;
                return {
                  pageIndex: page.pageIndex,
                  x: Math.round(cl.x + cl.width * fraction),
                  y: caretY,
                  height: caretHeight,
                  baseline: entry.baseline,
                };
              }
            }

            return {
              pageIndex: page.pageIndex,
              x: entry.rect.x,
              y: caretY,
              height: caretHeight,
              baseline: entry.baseline,
            };
          }
        }
      }
    }

    // Also search inside page blocks and table cells
    for (const page of pages) {
      for (const blk of page.blocks) {
        if (blk.tableLayout) {
          for (const row of blk.tableLayout.rows) {
            for (const cell of row.cells) {
              for (const cb of cell.blocks) {
                if (cb.blockId === pos.blockId) {
                  for (const line of cb.lines) {
                    if (pos.offset >= line.startOffset && pos.offset <= line.endOffset) {
                      const caretY = Math.round(line.baseline - fontSizePx * 0.88);
                      const lineClusters: PositionedCluster[] = (line as any).clusters || (line.runs || []).flatMap((r: any) => r.clusters || []);
                      if (lineClusters.length === 0 || pos.offset === 0) {
                        return {
                          pageIndex: page.pageIndex,
                          x: line.rect.x,
                          y: caretY,
                          height: caretHeight,
                          baseline: line.baseline,
                        };
                      }
                      if (pos.offset === line.endOffset) {
                        const lastCl = lineClusters[lineClusters.length - 1];
                        return {
                          pageIndex: page.pageIndex,
                          x: lastCl.x + lastCl.width,
                          y: caretY,
                          height: caretHeight,
                          baseline: line.baseline,
                        };
                      }
                      for (const cl of lineClusters) {
                        if (pos.offset >= cl.offsetInBlock && pos.offset <= cl.offsetInBlock + cl.cluster.length) {
                          const fraction = cl.cluster.length > 0 ? (pos.offset - cl.offsetInBlock) / cl.cluster.length : 0;
                          return {
                            pageIndex: page.pageIndex,
                            x: Math.round(cl.x + cl.width * fraction),
                            y: caretY,
                            height: caretHeight,
                            baseline: line.baseline,
                          };
                        }
                      }
                      return {
                        pageIndex: page.pageIndex,
                        x: line.rect.x,
                        y: caretY,
                        height: caretHeight,
                        baseline: line.baseline,
                      };
                    }
                  }
                  return {
                    pageIndex: page.pageIndex,
                    x: cell.rect.x + 8,
                    y: cell.rect.y + 6,
                    height: caretHeight,
                    baseline: cell.rect.y + 6 + 14,
                  };
                }
              }
            }
          }
        }
      }
    }

    // Fallback: use first page content position
    const firstPage = layout.pages[0];
    if (firstPage) {
      return {
        pageIndex: 0,
        x: firstPage.contentRect.x,
        y: firstPage.contentRect.y + 2,
        height: 18,
        baseline: firstPage.contentRect.y + 14,
      };
    }
    return null;
  }

  /**
   * Calculates selection highlight rectangles across pages and lines.
   */
  public static getSelectionRectangles(
    selection: EditorSelection | null,
    layout: DocumentLayout,
    doc: DocumentModel,
    pageRange?: { start: number; end: number }
  ): SelectionPageRect[] {
    if (!selection) return [];
    const { start, end, isCollapsed } = normalizeSelection(selection, doc);
    if (isCollapsed) return [];

    const rects: SelectionPageRect[] = [];

    const pages = pageRange
      ? layout.pages.slice(Math.max(0, pageRange.start), Math.max(pageRange.start, pageRange.end))
      : layout.pages;

    for (const page of pages) {
      for (const entry of page.hitTestIndex) {
        // Check if this line is within selected blocks/offsets
        const blockIdx = doc.getBlockIndex(entry.blockId);
        const startBlockIdx = doc.getBlockIndex(start.blockId);
        const endBlockIdx = doc.getBlockIndex(end.blockId);

        const isInBlockRange = blockIdx >= startBlockIdx && blockIdx <= endBlockIdx;
        if (!isInBlockRange) continue;

        // Line is completely before selection start
        if (blockIdx === startBlockIdx && entry.endOffset <= start.offset) continue;
        // Line is completely after selection end
        if (blockIdx === endBlockIdx && entry.startOffset >= end.offset) continue;

        let selStartX = entry.rect.x;
        let selEndX = entry.rect.x + Math.max(10, entry.rect.width);

        if (entry.clusters.length > 0) {
          if (blockIdx === startBlockIdx && start.offset > entry.startOffset) {
            selStartX = HitTester.getXForOffset(entry, start.offset, selStartX);
          }

          if (blockIdx === endBlockIdx && end.offset < entry.endOffset) {
            selEndX = HitTester.getXForOffset(entry, end.offset, selEndX);
          }
        }

        const width = Math.max(4, selEndX - selStartX);
        rects.push({
          pageIndex: page.pageIndex,
          rect: {
            x: selStartX,
            y: entry.rect.y,
            width,
            height: entry.rect.height,
          },
        });
      }
    }

    return rects;
  }
}
