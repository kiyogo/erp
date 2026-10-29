export function scrollbarMetrics(height: number, contentHeight: number, scrollTop: number) {
  const maxScroll = Math.max(0, contentHeight - height);
  const thumbHeight = maxScroll > 0 ? Math.min(height, Math.max(24, height * height / contentHeight)) : height;
  const track = Math.max(0, height - thumbHeight);
  const thumbTop = maxScroll ? track * Math.max(0, Math.min(scrollTop, maxScroll)) / maxScroll : 0;
  return { maxScroll, thumbHeight, track, thumbTop };
}
