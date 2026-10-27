export interface AssetSystemRule {
  key: string;
  code?: string;
  name?: string;
  category?: string;
  details?: string;
  scope?: string;
  allocatedRole?: string;
  standardPackage?: string;
  budgetLimit?: number;
  prefixPattern?: string;
  depreciationMonthsDefault?: number;
  status?: string;
}

const normalizeText = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase();

const isActive = (rule: AssetSystemRule) => rule.status === 'Đang áp dụng';

export function isValidAssetCodePattern(pattern: string): boolean {
  return pattern.split('{YYYY}').length === 2
    && pattern.split('{####}').length === 2
    && !/[{}]/.test(pattern.replace('{YYYY}', '').replace('{####}', ''));
}

const matchesCategoryExactly = (rule: AssetSystemRule, category: string) => {
  const normalizedCategory = normalizeText(category);
  return normalizedCategory !== '' && [rule.name, rule.details].some((value) => normalizeText(value) === normalizedCategory);
};

export function findDepreciationDefault(rules: AssetSystemRule[], category: string): number | undefined {
  const matching = rules.filter((rule) => rule.category === 'Nhóm & Loại tài sản'
    && isActive(rule)
    && matchesCategoryExactly(rule, category)
    && Number.isSafeInteger(Number(rule.depreciationMonthsDefault))
    && Number(rule.depreciationMonthsDefault) > 0);
  return matching.length === 1 ? Number(matching[0].depreciationMonthsDefault) : undefined;
}

export function getAssetSystemOptions(rules: AssetSystemRule[], category: string): string[] {
  const seen = new Set<string>();
  return rules.filter((rule) => rule.category === category && isActive(rule))
    .map((rule) => String(rule.name ?? '').trim())
    .filter((name) => {
      const normalized = normalizeText(name);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function findAllocationQuotaRule(rules: AssetSystemRule[], role: string, department: string): AssetSystemRule | undefined {
  const normalizedRole = normalizeText(role);
  const normalizedDepartment = normalizeText(department);
  if (!normalizedRole) return undefined;
  const matching = rules.filter((rule) => rule.category === 'Định mức cấp phát chức danh'
    && isActive(rule)
    && normalizeText(rule.allocatedRole) === normalizedRole
    && (normalizeText(rule.scope) === 'toàn công ty' || (normalizedDepartment && normalizeText(rule.scope) === normalizedDepartment)));
  return matching.length === 1 ? matching[0] : undefined;
}

export function findCodePattern(rules: AssetSystemRule[], category: string): string | undefined {
  const activeRules = rules.filter((rule) => rule.category === 'Quy tắc sinh mã tự động'
    && isActive(rule)
    && typeof rule.prefixPattern === 'string'
    && isValidAssetCodePattern(rule.prefixPattern));
  const exactMatches = activeRules.filter((rule) => matchesCategoryExactly(rule, category));
  if (exactMatches.length === 1) return exactMatches[0].prefixPattern;
  return activeRules.length === 1 ? activeRules[0].prefixPattern : undefined;
}

export function generateAssetCode(pattern: string | undefined, year: number, existingCodes: string[], fallback: () => string): string {
  if (!pattern || !isValidAssetCodePattern(pattern)) return fallback();
  const usedCodes = new Set(existingCodes.map(normalizeText));
  for (let sequence = 1; sequence <= 9999; sequence += 1) {
    const code = pattern.replace('{YYYY}', String(year)).replace('{####}', String(sequence).padStart(4, '0'));
    if (!usedCodes.has(normalizeText(code))) return code;
  }
  return fallback();
}
