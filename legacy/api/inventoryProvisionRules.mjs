// Dự phòng giảm giá hàng tồn kho: mức trích lập = giá gốc hàng tồn kho trừ giá trị thuần có thể thực hiện được (giá bán ước tính trừ chi phí
// bán hàng), chỉ lập cho mặt hàng có giá gốc cao hơn giá trị thuần. Căn cứ: Chuẩn mực kế toán VAS 02 (giá trị thấp hơn giữa giá gốc và giá
// trị thuần), Thông tư 48/2019/TT-BTC (đã sửa bởi Thông tư 24/2022/TT-BTC) về điều kiện, mức trích lập, hồ sơ; xác minh qua bài tổng hợp,
// chưa đối chiếu văn bản gốc. Hệ thống chưa kiểm tra điều kiện được trừ thuế TNDN (hóa đơn chứng từ, thời điểm, bảng kê chi tiết).

// quantity là số lượng tồn; unitCost, nrvUnit tính theo đơn vị. Kết quả làm tròn đồng.
export function provisionLine({ quantity, unitCost, nrvUnit }) {
  const cost = Math.round(quantity * unitCost);
  const nrv = Math.round(quantity * nrvUnit);
  return { cost, nrv, required: Math.max(0, cost - nrv) };
}

// Tổng hợp một kỳ lập: lines gồm mặt hàng được đánh giá lại và mặt hàng đã có dự phòng kỳ trước nhưng không còn được lập (hoàn nhập).
export function provisionTotals(lines) {
  const totalRequired = lines.reduce((sum, line) => sum + line.required, 0);
  const totalPrevious = lines.reduce((sum, line) => sum + line.previous, 0);
  return { totalRequired, totalPrevious, totalAdjustment: totalRequired - totalPrevious };
}
