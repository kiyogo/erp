export type SupplierScores = {
  qualityScore: number;
  deliveryScore: number;
  priceScore: number;
  serviceScore: number;
};

export type SupplierEvaluationMetricRecord = {
  totalScore: number;
  tier: string;
};

const scoreLimits: SupplierScores = { qualityScore: 40, deliveryScore: 30, priceScore: 20, serviceScore: 10 };

export function deriveSupplierScore(scores: SupplierScores) {
  for (const [field, maximum] of Object.entries(scoreLimits) as [keyof SupplierScores, number][]) {
    const score = scores[field];
    if (!Number.isInteger(score) || score < 0 || score > maximum) throw new Error(`Điểm ${field} phải từ 0 đến ${maximum}.`);
  }
  const totalScore = scores.qualityScore + scores.deliveryScore + scores.priceScore + scores.serviceScore;
  return { totalScore, tier: totalScore >= 90 ? 'Hạng A' : totalScore >= 75 ? 'Hạng B' : 'Hạng C' } as const;
}

export function supplierEvaluationMetrics(records: SupplierEvaluationMetricRecord[]) {
  return {
    count: records.length,
    tierACount: records.filter((record) => record.tier === 'Hạng A').length,
    tierBCount: records.filter((record) => record.tier === 'Hạng B').length,
    tierCCount: records.filter((record) => record.tier === 'Hạng C').length,
    averageScore: records.length ? records.reduce((sum, record) => sum + record.totalScore, 0) / records.length : null,
  };
}

export type SupplierEvaluationExportRecord = SupplierScores & {
  evalCode: string;
  supplierName: string;
  category: string;
  totalScore: number;
  tier: string;
  evalPeriod: string;
  evaluator: string;
  decision?: string;
};

export function supplierEvaluationExportRows(records: SupplierEvaluationExportRecord[]) {
  return [
    ['Mã đánh giá', 'Nhà cung cấp', 'Lĩnh vực', 'Kỳ đánh giá', 'Chất lượng', 'Tiến độ', 'Giá', 'Dịch vụ', 'Tổng điểm', 'Phân hạng', 'Người đánh giá', 'Kết luận'],
    ...records.map((record) => [
      record.evalCode, record.supplierName, record.category, record.evalPeriod, record.qualityScore,
      record.deliveryScore, record.priceScore, record.serviceScore, record.totalScore, record.tier,
      record.evaluator, record.decision || '',
    ]),
  ];
}
