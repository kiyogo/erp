import { EMOJI_DATA, type EmojiData } from './emoji-data';

/**
 * Chuẩn hóa chuỗi tiếng Việt: loại bỏ dấu, chuyển thành chữ thường.
 * Sử dụng NFD để tách dấu ra khỏi ký tự gốc, sau đó xóa các ký tự dấu.
 */
export const removeVietnameseTones = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

/**
 * Chuẩn hóa chuỗi tìm kiếm
 */
export const normalizeText = (text: string): { original: string; normalized: string } => {
  const original = text.toLowerCase().trim();
  const normalized = removeVietnameseTones(original);
  return { original, normalized };
};

/**
 * Kiểm tra xem một chuỗi có chứa từ bắt đầu bằng query hay không.
 * Tránh việc match chuỗi con ở giữa từ (VD: "o" không nên match "cuoi").
 */
const matchWordBoundary = (text: string, query: string): boolean => {
  if (!text || !query) return false;
  return text.startsWith(query) || 
         text.includes(' ' + query) || 
         text.includes('_' + query) || 
         text.includes('-' + query);
};

// Cache for search results to improve performance
const searchCache = new Map<string, EmojiData[]>();

// Tiền xử lý dữ liệu để tìm kiếm nhanh hơn
const PROCESSED_DATA = EMOJI_DATA.map(item => ({
  ...item,
  nameOrig: item.name.toLowerCase(),
  nameNorm: removeVietnameseTones(item.name.toLowerCase()),
  kwOrig: item.keywords.map(k => k.toLowerCase()),
  kwNorm: item.keywords.map(k => removeVietnameseTones(k.toLowerCase())),
  aliasesNorm: item.aliases.map(a => a.toLowerCase()),
}));

/**
 * Tìm kiếm emoji theo từ khóa tiếng Việt
 */
export const searchEmojis = (query: string): EmojiData[] => {
  if (!query || !query.trim()) return [];
  
  const { original, normalized } = normalizeText(query);
  const cacheKey = original;
  
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  const results: { emoji: EmojiData; score: number }[] = [];

  for (const item of PROCESSED_DATA) {
    let score = 0;
    
    // 1. Khớp chính xác hoàn toàn
    if (item.emoji === query) score += 1000;
    if (item.nameOrig === original) score += 900;
    else if (item.nameNorm === normalized) score += 800;
    if (item.aliasesNorm.includes(original)) score += 850;
    if (item.kwOrig.includes(original)) score += 700;
    else if (item.kwNorm.includes(normalized)) score += 600;

    // 2. Khớp từ ranh giới (Word boundary)
    if (score === 0) {
      if (matchWordBoundary(item.nameOrig, original)) score += 500;
      else if (matchWordBoundary(item.nameNorm, normalized)) score += 400;

      const matchedAlias = item.aliasesNorm.find(a => matchWordBoundary(a, original));
      if (matchedAlias) score += 350;

      const matchedKwOrig = item.kwOrig.find(k => matchWordBoundary(k, original));
      if (matchedKwOrig) score += 300;
      else {
        const matchedKwNorm = item.kwNorm.find(k => matchWordBoundary(k, normalized));
        if (matchedKwNorm) score += 200;
      }
    }

    // 3. Khớp chuỗi con (Chỉ áp dụng nếu query đủ dài để tránh nhiễu)
    if (score === 0 && normalized.length >= 2) {
      if (item.nameOrig.includes(original)) score += 100;
      else if (item.nameNorm.includes(normalized)) score += 80;
      else if (item.aliasesNorm.some(a => a.includes(original))) score += 70;
      else if (item.kwOrig.some(k => k.includes(original))) score += 50;
      else if (item.kwNorm.some(k => k.includes(normalized))) score += 30;
    }

    if (score > 0) {
      // Trả lại EmojiData gốc
      results.push({ 
        emoji: EMOJI_DATA.find(e => e.emoji === item.emoji)!, 
        score 
      });
    }
  }

  // Sắp xếp theo điểm số giảm dần
  const finalResults = results
    .sort((a, b) => b.score - a.score)
    .map(r => r.emoji);
  
  // Quản lý cache: giữ tối đa 100 kết quả gần nhất để tránh leak memory
  if (searchCache.size >= 100) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
  searchCache.set(cacheKey, finalResults);
  
  return finalResults;
};

