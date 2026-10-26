use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, authenticated_user};

const DEFAULT_PAGE_SIZE: usize = 10;
const MAX_PAGE_SIZE: usize = 100;
const MAX_SEARCH_CHARS: usize = 80;
const MAX_OWNER_RECORDS: usize = 5_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ListPayslipsQuery {
    page: Option<usize>,
    limit: Option<usize>,
    search: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmployeePayslip {
    id: String,
    month: Option<String>,
    basic_salary: Option<u64>,
    allowance: Option<u64>,
    bonus_kpi: Option<u64>,
    insurance_deduction: Option<u64>,
    personal_tax: Option<u64>,
    net_salary: Option<u64>,
    source_status: Option<String>,
    data_status: &'static str,
}

pub(super) async fn list_my_employee_payslips(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ListPayslipsQuery>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    if actor.role == ADMIN_ROLE {
        return Err(ApiError::forbidden(
            "Employee payslips are available only through the employee's own account.",
        ));
    }

    let page = query.page.unwrap_or(1);
    let limit = query.limit.unwrap_or(DEFAULT_PAGE_SIZE);
    if page == 0 || page > 1_000_000 || limit == 0 || limit > MAX_PAGE_SIZE {
        return Err(ApiError::bad_request("Invalid payslip page or limit."));
    }
    let search = query.search.unwrap_or_default();
    let search = search.trim();
    if search.chars().count() > MAX_SEARCH_CHARS {
        return Err(ApiError::bad_request("Payslip search is too long."));
    }
    let offset = page
        .checked_sub(1)
        .and_then(|value| value.checked_mul(limit))
        .ok_or_else(|| ApiError::bad_request("Invalid payslip page."))?;

    let db = state.db.lock().await;
    let has_active_profile: bool = db
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM employee_profiles p
                WHERE p.user_id = ?1
                  AND p.employment_status NOT IN ('Đã nghỉ việc', 'Chờ kích hoạt')
            )",
            params![actor.id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if !has_active_profile {
        return Err(ApiError::conflict(
            "Tài khoản chưa liên kết với hồ sơ nhân viên đang hoạt động.",
        ));
    }

    let owner_filter = "scope = 'employee_payslips' AND (
        CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeId') END = ?1 OR
        CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.userId') END = ?1 OR
        CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeUserId') END = ?1
    ) AND
        (CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeId') END IS NULL OR
         CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeId') END = ?1) AND
        (CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.userId') END IS NULL OR
         CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.userId') END = ?1) AND
        (CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeUserId') END IS NULL OR
         CASE WHEN json_valid(record_json) THEN json_extract(record_json, '$.employeeUserId') END = ?1)";
    let count_sql = format!("SELECT COUNT(*) FROM collection_records WHERE {owner_filter}");
    let owner_record_count: usize = db
        .query_row(&count_sql, params![actor.id], |row| row.get(0))
        .map_err(ApiError::internal)?;
    if owner_record_count > MAX_OWNER_RECORDS {
        return Err(ApiError::conflict(
            "Phiếu lương vượt giới hạn xử lý an toàn; cần quản trị viên lưu trữ dữ liệu cũ trước.",
        ));
    }

    let rows_sql = format!(
        "SELECT record_key, record_json FROM collection_records
         WHERE {owner_filter}
         ORDER BY created_at DESC, record_key DESC"
    );
    let mut statement = db.prepare(&rows_sql).map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![actor.id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;

    let search = search.to_lowercase();
    let mut matching_payslips = Vec::new();
    for (id, record_json) in rows {
        let record: Value = serde_json::from_str(&record_json).map_err(ApiError::internal)?;
        if !record_has_unambiguous_owner(&record, &actor.id) {
            continue;
        }
        let payslip = project_payslip(&id, &record);
        let matches_search = search.is_empty()
            || payslip
                .month
                .as_deref()
                .is_some_and(|month| month.to_lowercase().contains(&search))
            || payslip
                .source_status
                .as_deref()
                .is_some_and(|status| status.to_lowercase().contains(&search));
        if matches_search {
            matching_payslips.push(payslip);
        }
    }
    let total = matching_payslips.len();
    let data = matching_payslips
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();

    let total_pages = total.div_ceil(limit);
    Ok(Json(json!({
        "data": data,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "totalPages": total_pages
        }
    })))
}

fn record_has_unambiguous_owner(record: &Value, actor_id: &str) -> bool {
    let (seen, matches) = ["employeeId", "userId", "employeeUserId"]
        .into_iter()
        .filter_map(|field| record.get(field).and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .fold((false, true), |(_, matches), value| {
            (true, matches && value == actor_id)
        });
    seen && matches
}

fn project_payslip(id: &str, record: &Value) -> EmployeePayslip {
    EmployeePayslip {
        id: id.to_owned(),
        month: bounded_source_text(record.get("month"), 80),
        basic_salary: bounded_source_amount(record.get("basicSalary")),
        allowance: bounded_source_amount(record.get("allowance")),
        bonus_kpi: bounded_source_amount(record.get("bonusKPI")),
        insurance_deduction: bounded_source_amount(record.get("insuranceDeduction")),
        personal_tax: bounded_source_amount(record.get("personalTax")),
        net_salary: bounded_source_amount(record.get("netSalary")),
        source_status: bounded_source_text(record.get("status"), 80),
        // Legacy `signedStatus` is intentionally not projected: it is only a client-side claim.
        data_status: "unverified",
    }
}

fn bounded_source_text(value: Option<&Value>, max_chars: usize) -> Option<String> {
    let value = value?.as_str()?.trim();
    (!value.is_empty() && value.chars().count() <= max_chars).then(|| value.to_owned())
}

fn bounded_source_amount(value: Option<&Value>) -> Option<u64> {
    let value = value?.as_u64()?;
    (value <= 1_000_000_000_000).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::{
        bounded_source_amount, bounded_source_text, project_payslip, record_has_unambiguous_owner,
    };
    use serde_json::json;

    #[test]
    fn owner_binding_requires_an_exact_immutable_user_identifier() {
        assert!(record_has_unambiguous_owner(
            &json!({"employeeId":"employee-1"}),
            "employee-1"
        ));
        assert!(record_has_unambiguous_owner(
            &json!({"employeeUserId":"employee-1","userId":"employee-1"}),
            "employee-1"
        ));
        assert!(!record_has_unambiguous_owner(
            &json!({"employeeCode":"EMP-1"}),
            "employee-1"
        ));
        assert!(!record_has_unambiguous_owner(
            &json!({"employeeId":"employee-2"}),
            "employee-1"
        ));
        assert!(!record_has_unambiguous_owner(
            &json!({"employeeId":"employee-1","userId":"employee-2"}),
            "employee-1"
        ));
    }

    #[test]
    fn payslip_projection_excludes_signature_claims_and_unknown_personal_fields() {
        let payslip = project_payslip(
            "record-1",
            &json!({
                "employeeId":"employee-1",
                "month":"2026-08",
                "basicSalary":42000000,
                "allowance":1000000,
                "bonusKPI":2500000,
                "insuranceDeduction":4410000,
                "personalTax":1200000,
                "netSalary":37890000,
                "status":"Đã thanh toán",
                "signedStatus":"Đã ký số xác nhận",
                "signerName":"Employee",
                "bankAccount":"123456789"
            }),
        );
        let wire = serde_json::to_value(payslip).expect("serialize payslip");
        assert_eq!(wire["id"], "record-1");
        assert_eq!(wire["basicSalary"], 42_000_000);
        assert_eq!(wire["dataStatus"], "unverified");
        assert!(wire.get("signedStatus").is_none());
        assert!(wire.get("signerName").is_none());
        assert!(wire.get("bankAccount").is_none());
    }

    #[test]
    fn malformed_or_out_of_range_payroll_values_are_not_coerced_to_zero() {
        assert_eq!(
            bounded_source_amount(Some(&json!(12000000))),
            Some(12_000_000)
        );
        assert_eq!(bounded_source_amount(Some(&json!(-1))), None);
        assert_eq!(bounded_source_amount(Some(&json!(12.5))), None);
        assert_eq!(
            bounded_source_amount(Some(&json!(1_000_000_000_001_u64))),
            None
        );
        assert_eq!(bounded_source_amount(None), None);
        assert_eq!(bounded_source_text(Some(&json!("   ")), 80), None);
        assert_eq!(
            bounded_source_text(Some(&json!("Tháng 08/2026")), 80).as_deref(),
            Some("Tháng 08/2026")
        );
    }
}
