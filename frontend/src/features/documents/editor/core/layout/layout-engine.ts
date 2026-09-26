import { DocumentModel } from '../model/document-model';
import {
  BlockNode,
  ParagraphBlock,
  HeadingBlock,
  ListItemBlock,
  TableBlock,
  ImageBlock,
  DocumentSettings,
} from '../model/types';
import { PAPER_SIZES } from '../utils/units';
import {
  DocumentLayout,
  PageLayout,
  BlockLayout,
  TextLineLayout,
  HitTestEntry,
  Rect,
} from './layout-types';
import { layoutParagraphLines } from './line-breaker';
import { DisplayList } from '../rendering/display-list';
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FOREGROUND_COLOR } from '../model/defaults';
import { fontMetrics } from '../fonts/font-metrics-service';

export class LayoutEngine {
  /**
   * Layouts an entire DocumentModel into paginated PageLayouts and DisplayLists.
   */
  public layoutDocument(doc: DocumentModel): DocumentLayout {
    const settings = doc.settings;
    const paperDim = PAPER_SIZES[settings.pageSize] || PAPER_SIZES.A4;

    const isLandscape = settings.orientation === 'landscape';
    const pageWidth = isLandscape ? paperDim.height : paperDim.width;
    const pageHeight = isLandscape ? paperDim.width : paperDim.height;

    const margins = settings.margins;
    const contentRect: Rect = {
      x: margins.left,
      y: margins.top,
      width: Math.max(100, pageWidth - margins.left - margins.right),
      height: Math.max(100, pageHeight - margins.top - margins.bottom),
    };

    const pages: PageLayout[] = [];

    let currentPageIndex = 0;
    let currentY = contentRect.y;
    let currentBlocks: BlockLayout[] = [];
    let currentHitTests: HitTestEntry[] = [];
    let currentDisplayList = new DisplayList();

    const startNewPage = () => {
      // Build display list for completed page
      this.buildPageDisplayList(currentDisplayList, settings, currentBlocks, pageWidth, pageHeight);

      pages.push({
        pageIndex: currentPageIndex,
        width: pageWidth,
        height: pageHeight,
        contentRect: { ...contentRect },
        blocks: currentBlocks,
        hitTestIndex: currentHitTests,
        displayList: currentDisplayList.commands,
      });

      currentPageIndex += 1;
      currentY = contentRect.y;
      currentBlocks = [];
      currentHitTests = [];
      currentDisplayList = new DisplayList();
    };

    // Track numbered list counters per level
    const listCounters: Record<number, number> = {};

    for (let bIdx = 0; bIdx < doc.blocks.length; bIdx++) {
      const block = doc.blocks[bIdx];

      // Explicit Page Break
      if (block.type === 'page-break') {
        startNewPage();
        continue;
      }

      if (block.type === 'horizontal-rule') {
        const hrHeight = 16;
        if (currentY + hrHeight > contentRect.y + contentRect.height && currentBlocks.length > 0) {
          startNewPage();
        }
        const blockLayout: BlockLayout = {
          blockId: block.id,
          blockType: 'horizontal-rule',
          pageIndex: currentPageIndex,
          rect: {
            x: contentRect.x,
            y: currentY,
            width: contentRect.width,
            height: hrHeight,
          },
          lines: [],
        };
        currentBlocks.push(blockLayout);
        currentY += hrHeight;
        continue;
      }

      if (block.type === 'image') {
        const imgBlock = block as ImageBlock;
        const maxImgWidth = Math.min(imgBlock.width || 300, contentRect.width);
        const imgHeight = imgBlock.height || 200;
        const totalImgHeight = imgHeight + 12;

        if (currentY + totalImgHeight > contentRect.y + contentRect.height && currentBlocks.length > 0) {
          startNewPage();
        }

        let imgX = contentRect.x;
        if (imgBlock.alignment === 'center') {
          imgX = contentRect.x + (contentRect.width - maxImgWidth) / 2;
        } else if (imgBlock.alignment === 'right') {
          imgX = contentRect.x + contentRect.width - maxImgWidth;
        }

        const blockLayout: BlockLayout = {
          blockId: imgBlock.id,
          blockType: 'image',
          pageIndex: currentPageIndex,
          rect: {
            x: imgX,
            y: currentY,
            width: maxImgWidth,
            height: totalImgHeight,
          },
          lines: [],
          imageLayout: {
            rect: { x: imgX, y: currentY + 6, width: maxImgWidth, height: imgHeight },
            src: imgBlock.src,
            alt: imgBlock.alt,
            alignment: imgBlock.alignment,
          },
        };
        currentBlocks.push(blockLayout);
        currentY += totalImgHeight;
        continue;
      }

      if (block.type === 'table') {
        const tableBlock = block as TableBlock;
        currentY = this.layoutTableBlock(
          tableBlock,
          contentRect,
          currentY,
          currentPageIndex,
          currentBlocks,
          currentHitTests,
          startNewPage
        );
        continue;
      }

      // Paragraph / Heading / ListItem
      const paraStyle = block.style || {};
      const spaceBefore = paraStyle.spaceBefore || 0;
      const spaceAfter = paraStyle.spaceAfter || 0;

      currentY += spaceBefore;

      let listMarker = undefined;
      let leftMarginShift = 0;

      if (block.type === 'list-item') {
        const listBlock = block as ListItemBlock;
        const level = listBlock.listStyle.level || 0;
        leftMarginShift = 24 + level * 20;

        if (listBlock.listStyle.listType === 'numbered') {
          listCounters[level] = (listCounters[level] || 0) + 1;
          const markerText = `${listCounters[level]}.`;
          listMarker = {
            text: markerText,
            x: contentRect.x + leftMarginShift - 20,
            y: currentY,
            baseline: currentY + 12,
            marks: block.runs[0]?.marks || {},
          };
        } else if (listBlock.listStyle.listType === 'checklist') {
          listMarker = {
            text: '',
            x: contentRect.x + leftMarginShift - 20,
            y: currentY,
            baseline: currentY + 12,
            isChecklist: true,
            checked: Boolean(listBlock.listStyle.checked),
            marks: block.runs[0]?.marks || {},
          };
        } else {
          listMarker = {
            text: '•',
            x: contentRect.x + leftMarginShift - 16,
            y: currentY,
            baseline: currentY + 12,
            marks: block.runs[0]?.marks || {},
          };
        }
      } else {
        // Reset list counters if exiting list
        Object.keys(listCounters).forEach((k) => delete listCounters[Number(k)]);
      }

      const layoutResult = layoutParagraphLines({
        blockId: block.id,
        runs: block.runs,
        style: {
          ...paraStyle,
          indentStart: (paraStyle.indentStart || 0) + leftMarginShift,
        },
        contentWidth: contentRect.width,
        startX: contentRect.x,
        startY: currentY,
      });

      // Split lines across pages if needed
      let blockStartPage = currentPageIndex;
      let blockStartY = currentY;
      let linesForCurrentBlock: TextLineLayout[] = [];

      for (let lIdx = 0; lIdx < layoutResult.lines.length; lIdx++) {
        const line = layoutResult.lines[lIdx];
        const lineH = line.rect.height;

        // Check if line overflows current page
        if (currentY + lineH > contentRect.y + contentRect.height && currentBlocks.length > 0) {
          if (linesForCurrentBlock.length > 0) {
            currentBlocks.push({
              blockId: block.id,
              blockType: block.type,
              pageIndex: currentPageIndex,
              rect: {
                x: contentRect.x,
                y: blockStartY,
                width: contentRect.width,
                height: currentY - blockStartY,
              },
              lines: linesForCurrentBlock,
              listMarker,
            });
          }

          startNewPage();
          blockStartY = currentY;
          linesForCurrentBlock = [];
          listMarker = undefined; // marker only on first page segment
        }

        // Adjust line Y coordinate to current page Y
        const dy = currentY - line.rect.y;
        line.rect.y += dy;
        line.baseline += dy;
        line.pageIndex = currentPageIndex;

        for (const run of line.runs) {
          run.y += dy;
          run.baseline += dy;
          for (const cl of run.clusters) {
            cl.y += dy;
          }
        }

        linesForCurrentBlock.push(line);

        currentHitTests.push({
          pageIndex: currentPageIndex,
          blockId: block.id,
          lineIndex: line.lineIndex,
          rect: { ...line.rect },
          baseline: line.baseline,
          startOffset: line.startOffset,
          endOffset: line.endOffset,
          clusters: line.runs.flatMap((r) => r.clusters),
        });

        currentY += lineH;
      }

      if (linesForCurrentBlock.length > 0) {
        currentBlocks.push({
          blockId: block.id,
          blockType: block.type,
          pageIndex: currentPageIndex,
          rect: {
            x: contentRect.x,
            y: blockStartY,
            width: contentRect.width,
            height: currentY - blockStartY,
          },
          lines: linesForCurrentBlock,
          listMarker,
        });
      }

      currentY += spaceAfter;
    }

    // Finish final page
    this.buildPageDisplayList(currentDisplayList, settings, currentBlocks, pageWidth, pageHeight);
    pages.push({
      pageIndex: currentPageIndex,
      width: pageWidth,
      height: pageHeight,
      contentRect: { ...contentRect },
      blocks: currentBlocks,
      hitTestIndex: currentHitTests,
      displayList: currentDisplayList.commands,
    });

    const pageGap = 20;
    const documentHeight = pages.length * pageHeight + (pages.length - 1) * pageGap;

    return { pages, documentHeight };
  }

  private layoutTableBlock(
    table: TableBlock,
    contentRect: Rect,
    startY: number,
    pageIndex: number,
    currentBlocks: BlockLayout[],
    currentHitTests: HitTestEntry[],
    startNewPage: () => void
  ): number {
    let currentY = startY + 8;
    const tableX = contentRect.x;
    const colCount = table.columns?.length || 1;
    const rawTotalWidth = (table.columns || []).reduce((sum, col) => sum + (col.width || 0), 0);
    const colScale = rawTotalWidth > 0 ? contentRect.width / rawTotalWidth : 1;
    const defaultColWidth = contentRect.width / colCount;

    const rowLayouts = [];

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];
      let rowHeight = 32;

      // Layout cells
      const cellLayouts = [];
      let cellX = tableX;

      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c];
        const rawW = table.columns?.[c]?.width || defaultColWidth;
        const cellW = rawW * colScale;
        const cellBlocks: BlockLayout[] = [];

        let cellY = currentY + 6;

        for (const cb of cell.blocks) {
          if ('runs' in cb) {
            const res = layoutParagraphLines({
              blockId: cb.id,
              runs: cb.runs,
              style: cb.style || {},
              contentWidth: cellW - 16,
              startX: cellX + 8,
              startY: cellY,
            });

            for (const line of res.lines) {
              line.pageIndex = pageIndex;
              currentHitTests.push({
                pageIndex,
                blockId: cb.id,
                lineIndex: line.lineIndex,
                rect: { ...line.rect },
                baseline: line.baseline,
                startOffset: line.startOffset,
                endOffset: line.endOffset,
                clusters: line.runs.flatMap((run) => run.clusters),
              });
            }

            cellBlocks.push({
              blockId: cb.id,
              blockType: cb.type,
              pageIndex,
              rect: { x: cellX + 8, y: cellY, width: cellW - 16, height: res.totalHeight },
              lines: res.lines,
            });

            cellY += res.totalHeight;
          }
        }

        const cellCalculatedH = Math.max(32, cellY - currentY + 6);
        if (cellCalculatedH > rowHeight) {
          rowHeight = cellCalculatedH;
        }

        cellLayouts.push({
          cellId: cell.id,
          rect: { x: cellX, y: currentY, width: cellW, height: rowHeight },
          blocks: cellBlocks,
          style: cell.style,
        });

        cellX += cellW;
      }

      // Check if table row overflows page
      if (currentY + rowHeight > contentRect.y + contentRect.height && currentBlocks.length > 0) {
        startNewPage();
        currentY = contentRect.y;
      }

      // Set equalized row height to all cell rects
      for (const cl of cellLayouts) {
        cl.rect.height = rowHeight;
      }

      rowLayouts.push({
        rowId: row.id,
        rect: { x: tableX, y: currentY, width: contentRect.width, height: rowHeight },
        cells: cellLayouts,
      });

      currentY += rowHeight;
    }

    currentBlocks.push({
      blockId: table.id,
      blockType: 'table',
      pageIndex,
      rect: {
        x: tableX,
        y: startY + 8,
        width: contentRect.width,
        height: currentY - (startY + 8),
      },
      lines: [],
      tableLayout: {
        rect: { x: tableX, y: startY + 8, width: contentRect.width, height: currentY - (startY + 8) },
        rows: rowLayouts,
        columns: table.columns,
        style: table.style,
      },
    });

    return currentY + 8;
  }

  /**
   * Generates paint commands for a page display list
   */
  private buildPageDisplayList(
    dl: DisplayList,
    settings: DocumentSettings,
    blocks: BlockLayout[],
    pageWidth: number,
    pageHeight: number
  ): void {
    // 1. Page Background
    dl.drawRect(0, 0, pageWidth, pageHeight, {
      fill: settings.pageColor || '#FFFFFF',
    });

    // 2. Draw blocks
    for (const block of blocks) {
      if (block.blockType === 'horizontal-rule') {
        const midY = block.rect.y + block.rect.height / 2;
        dl.drawLine(block.rect.x, midY, block.rect.x + block.rect.width, midY, '#E2E8F0', 1);
        continue;
      }

      if (block.imageLayout) {
        const img = block.imageLayout;
        dl.drawImage(img.src, img.rect.x, img.rect.y, img.rect.width, img.rect.height);
        continue;
      }

      if (block.tableLayout) {
        const tbl = block.tableLayout;
        const isTableBorderNone = tbl.style?.border === 'none';
        for (const row of tbl.rows) {
          for (const cell of row.cells) {
            // Cell background
            if (cell.style?.backgroundColor) {
              dl.drawRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height, {
                fill: cell.style.backgroundColor,
              });
            }
            // Cell border
            const isCellBorderNone = isTableBorderNone || cell.style?.border === 'none';
            if (!isCellBorderNone) {
              dl.drawRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height, {
                stroke: cell.style?.borderColor || '#CBD5E1',
                strokeWidth: 1,
              });
            }

            // Draw cell text lines
            for (const cb of cell.blocks) {
              this.drawBlockLines(dl, cb);
            }
          }
        }
        continue;
      }

      // List marker
      if (block.listMarker) {
        const m = block.listMarker;
        if (m.isChecklist) {
          const boxSize = 13;
          const boxY = block.lines[0]?.baseline ? block.lines[0].baseline - 10 : m.y;
          dl.drawRect(m.x, boxY, boxSize, boxSize, {
            stroke: '#94A3B8',
            strokeWidth: 1.5,
            fill: m.checked ? '#0F6CBD' : '#FFFFFF',
            radius: 3,
          });
          if (m.checked) {
            // Checkmark
            dl.drawLine(m.x + 3, boxY + 6, m.x + 5.5, boxY + 9.5, '#FFFFFF', 1.8);
            dl.drawLine(m.x + 5.5, boxY + 9.5, m.x + 10, boxY + 3.5, '#FFFFFF', 1.8);
          }
        } else if (m.text) {
          dl.drawText(
            m.text,
            m.x,
            block.lines[0]?.baseline || m.baseline,
            m.marks.fontFamily || DEFAULT_FONT_FAMILY,
            m.marks.fontSize || DEFAULT_FONT_SIZE,
            m.marks.foregroundColor || DEFAULT_FOREGROUND_COLOR,
            {
              fontWeight: m.marks.bold ? 'bold' : 'normal',
              fontStyle: m.marks.italic ? 'italic' : 'normal',
            }
          );
        }
      }

      // Draw normal paragraph lines
      this.drawBlockLines(dl, block);
    }
  }

  private drawBlockLines(dl: DisplayList, block: BlockLayout): void {
    for (const line of block.lines) {
      for (const run of line.runs) {
        // Background highlight
        if (run.marks.backgroundColor) {
          dl.drawRect(run.x, run.y, run.width, run.height, {
            fill: run.marks.backgroundColor,
          });
        }

        const textColor = run.marks.link
          ? '#1A73E8'
          : run.marks.foregroundColor || DEFAULT_FOREGROUND_COLOR;

        // Draw text
        dl.drawText(
          run.text,
          run.x,
          run.baseline,
          run.marks.fontFamily || DEFAULT_FONT_FAMILY,
          run.marks.fontSize || DEFAULT_FONT_SIZE,
          textColor,
          {
            fontWeight: run.marks.bold ? 'bold' : 'normal',
            fontStyle: run.marks.italic ? 'italic' : 'normal',
            underline: Boolean(run.marks.underline || run.marks.link),
            strike: Boolean(run.marks.strike),
          }
        );

        // Underline decoration
        if (run.marks.underline || run.marks.link) {
          const underlineY = run.baseline + 2;
          dl.drawLine(run.x, underlineY, run.x + run.width, underlineY, textColor, 1);
        }

        // Strikethrough decoration
        if (run.marks.strike) {
          const strikeY = run.baseline - (run.height * 0.25);
          dl.drawLine(run.x, strikeY, run.x + run.width, strikeY, textColor, 1);
        }
      }
    }
  }
}

export const layoutEngine = new LayoutEngine();
