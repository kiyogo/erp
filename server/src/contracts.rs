use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use rusqlite::{
    Connection, OptionalExtension, Row, params, params_from_iter, types::Value as SqlValue,
};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, authenticated_user, crm};

pub(super) fn install_schema(db: &Connection) -> anyhow::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS contracts (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          contract_category TEXT NOT NULL DEFAULT 'labor',
          contract_template TEXT NOT NULL DEFAULT 'Hợp đồng lao động chính thức',
          party_b_type TEXT NOT NULL DEFAULT 'employee',
          party_b_name TEXT NOT NULL DEFAULT '',
          party_b_tax_code TEXT NOT NULL DEFAULT '',
          party_b_representative TEXT NOT NULL DEFAULT '',
          party_b_position TEXT NOT NULL DEFAULT '',
          party_b_id_number TEXT NOT NULL DEFAULT '',
          party_b_phone TEXT NOT NULL DEFAULT '',
          party_b_email TEXT NOT NULL DEFAULT '',
          party_b_bank TEXT NOT NULL DEFAULT '',
          party_b_address TEXT NOT NULL DEFAULT '',
          employee_code TEXT NOT NULL DEFAULT '',
          employee_name TEXT NOT NULL DEFAULT '',
          employee_id_number TEXT NOT NULL DEFAULT '',
          employee_phone TEXT NOT NULL DEFAULT '',
          employee_email TEXT NOT NULL DEFAULT '',
          employee_bank TEXT NOT NULL DEFAULT '',
          employee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          contract_type TEXT NOT NULL DEFAULT 'Hợp đồng lao động chính thức',
          position TEXT NOT NULL DEFAULT '',
          department TEXT NOT NULL DEFAULT '',
          job_level TEXT NOT NULL DEFAULT '',
          work_location TEXT NOT NULL DEFAULT '',
          start_date TEXT NOT NULL DEFAULT '',
          end_date TEXT NOT NULL DEFAULT '',
          probation_months INTEGER NOT NULL DEFAULT 0,
          contract_value BIGINT NOT NULL DEFAULT 0,
          salary BIGINT NOT NULL DEFAULT 0,
          allowance BIGINT NOT NULL DEFAULT 0,
          stock_shares_percent TEXT NOT NULL DEFAULT '',
          payment_method TEXT NOT NULL DEFAULT '',
          payment_day INTEGER NOT NULL DEFAULT 5,
          working_hours TEXT NOT NULL DEFAULT '',
          annual_leave_days INTEGER NOT NULL DEFAULT 12,
          insurance_type TEXT NOT NULL DEFAULT '',
          nda_clause INTEGER NOT NULL DEFAULT 1,
          non_compete_clause INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'Chờ ký',
          employee_sign_status TEXT NOT NULL DEFAULT 'Chưa ký',
          employee_sign_date TEXT,
          employee_sign_method TEXT,
          employee_cert_name TEXT,
          employee_signed_file_name TEXT,
          company_sign_status TEXT NOT NULL DEFAULT 'Chưa ký',
          company_sign_date TEXT,
          company_sign_method TEXT,
          company_cert_name TEXT,
          company_signed_file_name TEXT,
          signer_name TEXT NOT NULL DEFAULT '',
          signer_position TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          custom_field_values_json TEXT NOT NULL DEFAULT '{}',
          file_node_id TEXT REFERENCES file_nodes(id) ON DELETE SET NULL,
          created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS contracts_code_idx ON contracts(LOWER(code));
        CREATE INDEX IF NOT EXISTS contracts_employee_code_idx ON contracts(LOWER(employee_code));
        CREATE INDEX IF NOT EXISTS contracts_employee_user_id_idx ON contracts(employee_user_id);
        CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);",
    )?;
    let has_archived_at: i64 = db.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('contracts') WHERE name = 'archived_at'",
        [],
        |row| row.get(0),
    )?;
    if has_archived_at == 0 {
        db.execute_batch("ALTER TABLE contracts ADD COLUMN archived_at TEXT;")?;
    }
    Ok(())
}

const CONTRACT_FIELDS: &[&str] = &[
    "name",
    "contract_category",
    "contract_template",
    "party_b_type",
    "party_b_name",
    "party_b_tax_code",
    "party_b_representative",
    "party_b_position",
    "party_b_id_number",
    "party_b_phone",
    "party_b_email",
    "party_b_bank",
    "party_b_address",
    "employee_code",
    "employee_name",
    "employee_id_number",
    "employee_phone",
    "employee_email",
    "employee_bank",
    "contract_type",
    "position",
    "department",
    "job_level",
    "work_location",
    "start_date",
    "end_date",
    "probation_months",
    "contract_value",
    "salary",
    "allowance",
    "stock_shares_percent",
    "payment_method",
    "payment_day",
    "working_hours",
    "annual_leave_days",
    "insurance_type",
    "nda_clause",
    "non_compete_clause",
    "status",
    "signer_name",
    "signer_position",
    "note",
    "custom_field_values_json",
];

struct ValidatedContract {
    code: String,
    employee_code: String,
    fields: Vec<SqlValue>,
}

fn input_text(
    input: &Value,
    key: &str,
    label: &str,
    limit: usize,
    default: &str,
    required: bool,
) -> ApiResult<String> {
    let Some(value) = input
        .get(key)
        .or_else(|| (key == "type").then(|| input.get("contractType")).flatten())
    else {
        return if required {
            Err(ApiError::unprocessable(format!("{label} là bắt buộc.")))
        } else {
            Ok(default.to_owned())
        };
    };
    let value = value
        .as_str()
        .ok_or_else(|| ApiError::unprocessable(format!("{label} phải là chuỗi văn bản.")))?
        .trim();
    if value.chars().count() > limit {
        return Err(ApiError::unprocessable(format!(
            "{label} vượt quá {limit} ký tự."
        )));
    }
    if required && value.is_empty() {
        return Err(ApiError::unprocessable(format!("{label} là bắt buộc.")));
    }
    Ok(value.to_owned())
}

fn input_amount(
    input: &Value,
    key: &str,
    label: &str,
    default: i64,
    minimum: i64,
    maximum: i64,
) -> ApiResult<i64> {
    let Some(value) = input.get(key) else {
        return Ok(default);
    };
    let amount = value
        .as_i64()
        .or_else(|| {
            value
                .as_str()
                .and_then(|text| text.trim().parse::<i64>().ok())
        })
        .ok_or_else(|| ApiError::unprocessable(format!("{label} phải là số nguyên.")))?;
    if !(minimum..=maximum).contains(&amount) {
        return Err(ApiError::unprocessable(format!(
            "{label} phải nằm trong khoảng {minimum}–{maximum}."
        )));
    }
    Ok(amount)
}

fn input_bool(input: &Value, key: &str, default: bool) -> ApiResult<bool> {
    match input.get(key) {
        None => Ok(default),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err(ApiError::unprocessable(format!(
            "{key} phải là true hoặc false."
        ))),
    }
}

fn encrypt_input(value: String, crypto: Option<&crm::CrmCrypto>) -> ApiResult<SqlValue> {
    if value.is_empty() {
        return Ok(SqlValue::Text(String::new()));
    }
    let crypto = crypto.ok_or_else(|| {
        ApiError::service_unavailable("Thiếu khóa mã hóa để lưu thông tin hợp đồng nhạy cảm.")
    })?;
    Ok(SqlValue::Text(crm::encrypt_contract_field(&value, crypto)?))
}

fn validate_contract(
    input: &Value,
    crypto: Option<&crm::CrmCrypto>,
) -> ApiResult<ValidatedContract> {
    let code = input_text(input, "code", "Mã hợp đồng", 80, "", false)?;
    let name = input_text(input, "name", "Tên hợp đồng", 300, "", true)?;
    let contract_category = input_text(
        input,
        "contractCategory",
        "Danh mục hợp đồng",
        80,
        "labor",
        false,
    )?;
    let contract_template = input_text(input, "contractTemplate", "Mẫu hợp đồng", 200, "", true)?;
    let party_b_type = input_text(input, "partyBType", "Loại đối tác", 40, "employee", false)?;
    let party_b_name = input_text(input, "partyBName", "Tên bên B", 200, "", false)?;
    let party_b_tax_code = input_text(input, "partyBTaxCode", "Mã số thuế bên B", 40, "", false)?;
    let party_b_representative = input_text(
        input,
        "partyBRepresentative",
        "Đại diện bên B",
        160,
        "",
        false,
    )?;
    let party_b_position = input_text(input, "partyBPosition", "Chức vụ bên B", 160, "", false)?;
    let party_b_id_number = input_text(input, "partyBIdNumber", "CCCD/CMND bên B", 40, "", false)?;
    let party_b_phone = input_text(input, "partyBPhone", "Điện thoại bên B", 32, "", false)?;
    let party_b_email = input_text(input, "partyBEmail", "Email bên B", 254, "", false)?;
    let party_b_bank = input_text(input, "partyBBank", "Ngân hàng bên B", 220, "", false)?;
    let party_b_address = input_text(input, "partyBAddress", "Địa chỉ bên B", 500, "", false)?;
    let employee_code = input_text(input, "employeeCode", "Mã nhân viên", 40, "", false)?;
    let employee_name = input_text(input, "employeeName", "Tên nhân viên", 160, "", false)?;
    let employee_id_number =
        input_text(input, "employeeIdNumber", "CCCD nhân viên", 40, "", false)?;
    let employee_phone = input_text(
        input,
        "employeePhone",
        "Điện thoại nhân viên",
        32,
        "",
        false,
    )?;
    let employee_email = input_text(input, "employeeEmail", "Email nhân viên", 254, "", false)?;
    let employee_bank = input_text(input, "employeeBank", "Ngân hàng nhân viên", 220, "", false)?;
    let contract_type = input_text(
        input,
        "type",
        "Loại hợp đồng",
        160,
        "Hợp đồng lao động chính thức",
        false,
    )?;
    let position = input_text(input, "position", "Vị trí", 160, "", false)?;
    let department = input_text(input, "department", "Phòng ban", 160, "", false)?;
    let job_level = input_text(input, "jobLevel", "Cấp bậc", 80, "", false)?;
    let work_location = input_text(input, "workLocation", "Địa điểm làm việc", 250, "", false)?;
    let start_date = input_text(input, "startDate", "Ngày bắt đầu", 40, "", false)?;
    let end_date = input_text(input, "endDate", "Ngày kết thúc", 40, "", false)?;
    let probation_months = input_amount(input, "probationMonths", "Thời gian thử việc", 0, 0, 120)?;
    let contract_value = input_amount(input, "contractValue", "Giá trị hợp đồng", 0, 0, i64::MAX)?;
    let salary = input_amount(input, "salary", "Mức lương", 0, 0, i64::MAX)?;
    let allowance = input_amount(input, "allowance", "Phụ cấp", 0, 0, i64::MAX)?;
    let stock_shares_percent =
        input_text(input, "stockSharesPercent", "Tỷ lệ cổ phần", 120, "", false)?;
    let payment_method = input_text(
        input,
        "paymentMethod",
        "Phương thức thanh toán",
        120,
        "",
        false,
    )?;
    let payment_day = input_amount(input, "paymentDay", "Ngày thanh toán", 5, 1, 31)?;
    let working_hours = input_text(input, "workingHours", "Thời gian làm việc", 160, "", false)?;
    let annual_leave_days = input_amount(input, "annualLeaveDays", "Ngày phép năm", 12, 0, 365)?;
    let insurance_type = input_text(input, "insuranceType", "Loại bảo hiểm", 160, "", false)?;
    let nda_clause = input_bool(input, "ndaClause", true)?;
    let non_compete_clause = input_bool(input, "nonCompeteClause", false)?;
    let status = input_text(input, "status", "Trạng thái", 80, "Dự thảo", false)?;
    if !["Dự thảo", "Chờ duyệt", "Chờ ký", "Đã hủy"].contains(&status.as_str()) {
        return Err(ApiError::unprocessable(
            "Chỉ được tạo/sửa hợp đồng ở trạng thái Dự thảo, Chờ duyệt, Chờ ký hoặc Đã hủy.",
        ));
    }
    let note = input_text(input, "note", "Ghi chú", 2_000, "", false)?;
    let signer_name = input_text(input, "signerName", "Người đại diện ký", 160, "", false)?;
    let signer_position = input_text(input, "signerPosition", "Chức vụ người ký", 160, "", false)?;
    let custom_fields = input
        .get("customFieldValues")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if !custom_fields.is_object() || custom_fields.to_string().len() > 16 * 1024 {
        return Err(ApiError::unprocessable(
            "Trường tùy chỉnh phải là đối tượng JSON tối đa 16 KB.",
        ));
    }

    Ok(ValidatedContract {
        code,
        employee_code: employee_code.clone(),
        fields: vec![
            SqlValue::Text(name),
            SqlValue::Text(contract_category),
            SqlValue::Text(contract_template),
            SqlValue::Text(party_b_type),
            SqlValue::Text(party_b_name),
            SqlValue::Text(party_b_tax_code),
            SqlValue::Text(party_b_representative),
            SqlValue::Text(party_b_position),
            encrypt_input(party_b_id_number, crypto)?,
            encrypt_input(party_b_phone, crypto)?,
            encrypt_input(party_b_email, crypto)?,
            encrypt_input(party_b_bank, crypto)?,
            encrypt_input(party_b_address, crypto)?,
            SqlValue::Text(employee_code.clone()),
            SqlValue::Text(employee_name),
            encrypt_input(employee_id_number, crypto)?,
            encrypt_input(employee_phone, crypto)?,
            encrypt_input(employee_email, crypto)?,
            encrypt_input(employee_bank, crypto)?,
            SqlValue::Text(contract_type),
            SqlValue::Text(position),
            SqlValue::Text(department),
            SqlValue::Text(job_level),
            SqlValue::Text(work_location),
            SqlValue::Text(start_date),
            SqlValue::Text(end_date),
            SqlValue::Integer(probation_months),
            SqlValue::Integer(contract_value),
            SqlValue::Integer(salary),
            SqlValue::Integer(allowance),
            SqlValue::Text(stock_shares_percent),
            SqlValue::Text(payment_method),
            SqlValue::Integer(payment_day),
            SqlValue::Text(working_hours),
            SqlValue::Integer(annual_leave_days),
            SqlValue::Text(insurance_type),
            SqlValue::Integer(i64::from(nda_clause)),
            SqlValue::Integer(i64::from(non_compete_clause)),
            SqlValue::Text(status),
            SqlValue::Text(signer_name),
            SqlValue::Text(signer_position),
            SqlValue::Text(note),
            SqlValue::Text(custom_fields.to_string()),
        ],
    })
}

/// A deliberately narrow, read-only projection. It excludes salary, account and
/// identity-number fields, encrypted envelopes, notes, file IDs and custom data.
/// The legacy signing state is retained as source metadata, never proof.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ContractSummary {
    key: String,
    id: String,
    code: String,
    name: String,
    contract_category: String,
    contract_template: String,
    party_b_type: String,
    party_b_name: String,
    employee_code: String,
    employee_name: String,
    #[serde(rename = "type")]
    contract_type: String,
    position: String,
    department: String,
    start_date: String,
    end_date: String,
    status: String,
    employee_sign_status: String,
    employee_sign_date: Option<String>,
    company_sign_status: String,
    company_sign_date: Option<String>,
    signature_verification_status: &'static str,
    created_at: String,
    updated_at: String,
}

fn summary_from_row(row: &Row<'_>) -> rusqlite::Result<ContractSummary> {
    let id: String = row.get("id")?;
    Ok(ContractSummary {
        key: id.clone(),
        id,
        code: row.get("code")?,
        name: row.get("name")?,
        contract_category: row.get("contract_category")?,
        contract_template: row.get("contract_template")?,
        party_b_type: row.get("party_b_type")?,
        party_b_name: row.get("party_b_name")?,
        employee_code: row.get("employee_code")?,
        employee_name: row.get("employee_name")?,
        contract_type: row.get("contract_type")?,
        position: row.get("position")?,
        department: row.get("department")?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        status: row.get("status")?,
        employee_sign_status: row.get("employee_sign_status")?,
        employee_sign_date: row.get("employee_sign_date")?,
        company_sign_status: row.get("company_sign_status")?,
        company_sign_date: row.get("company_sign_date")?,
        signature_verification_status: "unverified",
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

struct RawContractDetails {
    summary: ContractSummary,
    employee_user_id: Option<String>,
    fields: Value,
    encrypted_fields: [String; 9],
}

impl RawContractDetails {
    fn from_row(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            summary: summary_from_row(row)?,
            employee_user_id: row.get("employee_user_id")?,
            fields: json!({
                "partyBTaxCode": row.get::<_, String>("party_b_tax_code")?,
                "partyBRepresentative": row.get::<_, String>("party_b_representative")?,
                "partyBPosition": row.get::<_, String>("party_b_position")?,
                "jobLevel": row.get::<_, String>("job_level")?,
                "workLocation": row.get::<_, String>("work_location")?,
                "probationMonths": row.get::<_, i64>("probation_months")?,
                "contractValue": row.get::<_, i64>("contract_value")?,
                "salary": row.get::<_, i64>("salary")?,
                "allowance": row.get::<_, i64>("allowance")?,
                "stockSharesPercent": row.get::<_, String>("stock_shares_percent")?,
                "paymentMethod": row.get::<_, String>("payment_method")?,
                "paymentDay": row.get::<_, i64>("payment_day")?,
                "workingHours": row.get::<_, String>("working_hours")?,
                "annualLeaveDays": row.get::<_, i64>("annual_leave_days")?,
                "insuranceType": row.get::<_, String>("insurance_type")?,
                "ndaClause": row.get::<_, i64>("nda_clause")? != 0,
                "nonCompeteClause": row.get::<_, i64>("non_compete_clause")? != 0,
                "signerName": row.get::<_, String>("signer_name")?,
                "signerPosition": row.get::<_, String>("signer_position")?,
                "note": row.get::<_, String>("note")?,
                "customFieldValues": serde_json::from_str::<Value>(
                    &row.get::<_, String>("custom_field_values_json")?,
                )
                .unwrap_or_else(|_| json!({})),
            }),
            encrypted_fields: [
                row.get("party_b_id_number")?,
                row.get("party_b_phone")?,
                row.get("party_b_email")?,
                row.get("party_b_bank")?,
                row.get("party_b_address")?,
                row.get("employee_id_number")?,
                row.get("employee_phone")?,
                row.get("employee_email")?,
                row.get("employee_bank")?,
            ],
        })
    }

    fn into_value(self, is_full: bool, crypto: Option<&crm::CrmCrypto>) -> ApiResult<Value> {
        let mut contract = serde_json::to_value(self.summary).map_err(ApiError::internal)?;
        let object = contract
            .as_object_mut()
            .ok_or_else(|| ApiError::internal("Hợp đồng không thể tuần tự hóa."))?;
        object.insert("isFull".to_owned(), json!(is_full));
        if is_full {
            let fields = self.encrypted_fields;
            for (name, value) in [
                "partyBIdNumber",
                "partyBPhone",
                "partyBEmail",
                "partyBBank",
                "partyBAddress",
                "employeeIdNumber",
                "employeePhone",
                "employeeEmail",
                "employeeBank",
            ]
            .into_iter()
            .zip(fields.iter())
            {
                object.insert(
                    name.to_owned(),
                    json!(crm::decrypt_contract_field(value, crypto)?),
                );
            }
            if let Some(extra) = self.fields.as_object() {
                object.extend(
                    extra
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone())),
                );
            }
        }
        Ok(contract)
    }
}

const SUMMARY_SELECT: &str = "
    SELECT c.id, c.code, c.name, c.contract_category, c.contract_template,
           c.party_b_type, c.party_b_name, c.employee_code, c.employee_name,
           c.contract_type, c.position, c.department, c.start_date, c.end_date,
           c.status, c.employee_sign_status, c.employee_sign_date,
           c.company_sign_status, c.company_sign_date, c.created_at, c.updated_at
    FROM contracts c
";

const OWNER_FILTER: &str = "
    (?1 = 1 OR c.employee_user_id = ?2 OR (
      c.employee_user_id IS NULL AND EXISTS (
        SELECT 1 FROM employee_profiles p
        WHERE p.user_id = ?2 AND p.employee_code = c.employee_code
      )
    ))
";

pub(super) async fn list_contracts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let is_admin = i64::from(actor.role == ADMIN_ROLE);
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(&format!(
            "{SUMMARY_SELECT} WHERE c.archived_at IS NULL AND {OWNER_FILTER} ORDER BY c.created_at DESC, c.id DESC"
        ))
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![is_admin, actor.id], summary_from_row)
        .map_err(ApiError::internal)?;
    let contracts = rows
        .map(|row| row.map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": contracts })))
}

pub(super) async fn get_contract(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(contract_id): Path<String>,
) -> ApiResult<Json<Value>> {
    if contract_id.trim().is_empty() || contract_id.chars().count() > 128 {
        return Err(ApiError::not_found("Không tìm thấy hợp đồng."));
    }
    let actor = authenticated_user(&state, &headers).await?;
    let is_admin = i64::from(actor.role == ADMIN_ROLE);
    let db = state.db.lock().await;
    let sql = format!(
        "SELECT * FROM contracts c WHERE c.id = ?3 AND c.archived_at IS NULL AND {OWNER_FILTER}"
    );
    let contract = db
        .query_row(
            &sql,
            params![is_admin, actor.id, contract_id],
            RawContractDetails::from_row,
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy hợp đồng."))?;
    let is_full = is_admin != 0 || contract.employee_user_id.as_deref() == Some(actor.id.as_str());
    let contract = contract.into_value(is_full, state.crm_crypto.as_ref())?;
    Ok(Json(json!({ "contract": contract })))
}

fn linked_employee_user_id(db: &Connection, employee_code: &str) -> ApiResult<Option<String>> {
    if employee_code.is_empty() {
        return Ok(None);
    }
    let mut statement = db
        .prepare(
            "SELECT user_id FROM employee_profiles WHERE LOWER(employee_code) = LOWER(?1) ORDER BY user_id LIMIT 2",
        )
        .map_err(ApiError::internal)?;
    let matches = statement
        .query_map([employee_code], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    if matches.len() > 1 {
        return Err(ApiError::unprocessable(
            "Mã nhân viên trùng với nhiều hồ sơ; hãy sửa hồ sơ nhân viên trước.",
        ));
    }
    Ok(matches.into_iter().next())
}

fn unique_contract_code(db: &Connection, requested: &str) -> ApiResult<String> {
    if !requested.is_empty() {
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM contracts WHERE LOWER(code) = LOWER(?1))",
                [requested],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if exists {
            return Err(ApiError::conflict("Mã hợp đồng đã tồn tại."));
        }
        return Ok(requested.to_owned());
    }
    let date = chrono::Utc::now().format("%Y%m%d");
    for _ in 0..10 {
        let candidate = format!(
            "HD-{date}-{}",
            &Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase()
        );
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM contracts WHERE LOWER(code) = LOWER(?1))",
                [&candidate],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err(ApiError::internal("Không thể tạo mã hợp đồng duy nhất."))
}

fn full_contract_response(
    db: &Connection,
    id: &str,
    crypto: Option<&crm::CrmCrypto>,
) -> ApiResult<Value> {
    let contract = db
        .query_row(
            "SELECT * FROM contracts WHERE id = ?1 AND archived_at IS NULL",
            [id],
            RawContractDetails::from_row,
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy hợp đồng."))?;
    Ok(json!({ "contract": contract.into_value(true, crypto)? }))
}

pub(super) async fn create_contract(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Value>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = crate::require_admin(&state, &headers).await?;
    let validated = validate_contract(&input, state.crm_crypto.as_ref())?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    let code = unique_contract_code(&db, &validated.code)?;
    let employee_user_id = linked_employee_user_id(&db, &validated.employee_code)?;
    let columns = CONTRACT_FIELDS.join(", ");
    let placeholders = vec!["?"; CONTRACT_FIELDS.len()].join(", ");
    let sql = format!(
        "INSERT INTO contracts (id, code, {columns}, employee_user_id, created_by, created_at, updated_at) VALUES (?, ?, {placeholders}, ?, ?, ?, ?)"
    );
    let mut values = vec![SqlValue::Text(id.clone()), SqlValue::Text(code)];
    values.extend(validated.fields);
    values.extend([
        employee_user_id.map_or(SqlValue::Null, SqlValue::Text),
        SqlValue::Text(actor.id),
        SqlValue::Text(now.clone()),
        SqlValue::Text(now),
    ]);
    db.execute(&sql, params_from_iter(values.iter()))
        .map_err(ApiError::internal)?;
    let response = full_contract_response(&db, &id, state.crm_crypto.as_ref())?;
    Ok((axum::http::StatusCode::CREATED, Json(response)))
}

pub(super) async fn update_contract(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(contract_id): Path<String>,
    Json(input): Json<Value>,
) -> ApiResult<Json<Value>> {
    crate::require_admin(&state, &headers).await?;
    if contract_id.trim().is_empty() || contract_id.chars().count() > 128 {
        return Err(ApiError::not_found("Không tìm thấy hợp đồng."));
    }
    let validated = validate_contract(&input, state.crm_crypto.as_ref())?;
    let now = chrono::Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM contracts WHERE id = ?1 AND archived_at IS NULL)",
            [&contract_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if !exists {
        return Err(ApiError::not_found("Không tìm thấy hợp đồng."));
    }
    let current_code: String = db
        .query_row(
            "SELECT code FROM contracts WHERE id = ?1 AND archived_at IS NULL",
            [&contract_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    let code = if validated.code.is_empty() {
        current_code
    } else {
        let duplicate: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM contracts WHERE LOWER(code) = LOWER(?1) AND id != ?2)",
                params![&validated.code, &contract_id],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if duplicate {
            return Err(ApiError::conflict("Mã hợp đồng đã tồn tại."));
        }
        validated.code.clone()
    };
    let employee_user_id = linked_employee_user_id(&db, &validated.employee_code)?;
    let assignments = CONTRACT_FIELDS
        .iter()
        .map(|field| format!("{field} = ?"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE contracts SET code = ?, {assignments}, employee_user_id = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL"
    );
    let mut values = vec![SqlValue::Text(code)];
    values.extend(validated.fields);
    values.extend([
        employee_user_id.map_or(SqlValue::Null, SqlValue::Text),
        SqlValue::Text(now),
        SqlValue::Text(contract_id.clone()),
    ]);
    db.execute(&sql, params_from_iter(values.iter()))
        .map_err(ApiError::internal)?;
    Ok(Json(full_contract_response(
        &db,
        &contract_id,
        state.crm_crypto.as_ref(),
    )?))
}

pub(super) async fn archive_contract(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(contract_id): Path<String>,
) -> ApiResult<Json<Value>> {
    crate::require_admin(&state, &headers).await?;
    if contract_id.trim().is_empty() || contract_id.chars().count() > 128 {
        return Err(ApiError::not_found("Không tìm thấy hợp đồng."));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    let changed = db
        .execute(
            "UPDATE contracts SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
            params![now, contract_id],
        )
        .map_err(ApiError::internal)?;
    if changed == 0 {
        return Err(ApiError::not_found("Không tìm thấy hợp đồng."));
    }
    Ok(Json(json!({ "deleted": true, "archived": true })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode},
        response::Response,
    };
    use chrono::Utc;
    use rusqlite::params;
    use serde_json::Value;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture() -> (Router, AppState, crate::User, crate::User, crate::User) {
        let db = Connection::open_in_memory().expect("contracts in-memory database");
        crate::init_database(&db).expect("initialize contracts schema");
        let now = Utc::now().to_rfc3339();
        let crypto = crm::CrmCrypto::for_test([0x42; 32], "v1");
        for (id, role) in [
            ("contract-admin", "ADMIN"),
            ("contract-owner", "USER"),
            ("contract-outsider", "USER"),
            ("contract-other-owner", "USER"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), if id == "contract-owner" { "Matching Name" } else { id }, role, now],
            )
            .expect("insert contract test account");
        }
        for (id, code) in [
            ("contract-owner", "EMP-CONTRACT-001"),
            ("contract-outsider", "EMP-CONTRACT-002"),
            ("contract-other-owner", "EMP-CONTRACT-003"),
        ] {
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,created_at,updated_at) VALUES (?1,?2,?3,?3)",
                params![id, code, now],
            )
            .expect("insert contract test profile");
        }
        insert_contract(
            &db,
            "contract-owned",
            "contract-owner",
            "EMP-CONTRACT-001",
            "Direct owner",
            "Matching Name",
            &crm::encrypt_contract_field("0900123456", &crypto)
                .expect("encrypt contract phone fixture"),
            &now,
        );
        insert_contract(
            &db,
            "contract-unowned-code",
            "",
            "EMP-CONTRACT-001",
            "Unowned exact-code legacy record",
            "Somebody Else",
            "",
            &now,
        );
        insert_contract(
            &db,
            "contract-name-only",
            "",
            "EMP-OTHER",
            "Name-only match must not grant access",
            "Matching Name",
            "",
            &now,
        );
        insert_contract(
            &db,
            "contract-conflicting-owner",
            "contract-other-owner",
            "EMP-CONTRACT-001",
            "Conflicting owner must not fall back to code",
            "Matching Name",
            "",
            &now,
        );

        let make_user = |id: &str, role: &str, name: &str| crate::User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("contract-admin", ADMIN_ROLE, "Admin");
        let employee = make_user("contract-owner", "USER", "Matching Name");
        let outsider = make_user("contract-outsider", "USER", "Outsider");
        let secret = b"contracts-test-secret-long-enough-for-a-token";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: Some(crypto),
        };
        (
            crate::router(state.clone(), CorsLayer::new()),
            state,
            admin,
            employee,
            outsider,
        )
    }

    fn insert_contract(
        db: &Connection,
        id: &str,
        owner_id: &str,
        employee_code: &str,
        name: &str,
        employee_name: &str,
        encrypted_sensitive_field: &str,
        now: &str,
    ) {
        db.execute(
            "INSERT INTO contracts (
                id,code,name,employee_user_id,employee_code,employee_name,
                employee_phone,salary,status,employee_sign_status,company_sign_status,
                created_at,updated_at
             ) VALUES (?1,?2,?3,NULLIF(?4,''),?5,?6,?7,80000000,'Còn hiệu lực','Đã ký','Đã ký',?8,?8)",
            params![
                id,
                format!("HD-{id}"),
                name,
                owner_id,
                employee_code,
                employee_name,
                encrypted_sensitive_field,
                now,
            ],
        )
        .expect("insert contract fixture");
    }

    fn bearer(state: &AppState, user: &crate::User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("contracts test JWT")
        )
    }

    async fn call(app: &Router, method: Method, uri: &str, token: Option<&str>) -> Response {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(token) = token {
            builder = builder.header("authorization", token);
        }
        app.clone()
            .oneshot(builder.body(Body::empty()).expect("contracts request"))
            .await
            .expect("contracts response")
    }

    async fn call_json(
        app: &Router,
        method: Method,
        uri: &str,
        token: Option<&str>,
        value: Value,
    ) -> Response {
        let mut builder = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(token) = token {
            builder = builder.header("authorization", token);
        }
        app.clone()
            .oneshot(
                builder
                    .body(Body::from(value.to_string()))
                    .expect("contracts JSON request"),
            )
            .await
            .expect("contracts JSON response")
    }

    async fn body(response: Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 1024 * 1024)
                .await
                .expect("contracts response body"),
        )
        .expect("contracts JSON response")
    }

    #[tokio::test]
    async fn contract_reads_are_scoped_by_owner_or_unambiguous_exact_employee_code() {
        let (app, state, admin, employee, outsider) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let outsider_token = bearer(&state, &outsider);

        assert_eq!(
            call(&app, Method::GET, "/api/v1/contracts", None)
                .await
                .status(),
            StatusCode::UNAUTHORIZED
        );
        let employee_response = call(
            &app,
            Method::GET,
            "/api/v1/contracts",
            Some(&employee_token),
        )
        .await;
        assert_eq!(employee_response.status(), StatusCode::OK);
        let employee_json = body(employee_response).await;
        let employee_rows = employee_json["data"].as_array().expect("contract list");
        assert_eq!(employee_rows.len(), 2);
        assert!(
            employee_rows
                .iter()
                .any(|row| row["id"] == "contract-owned")
        );
        assert!(
            employee_rows
                .iter()
                .any(|row| row["id"] == "contract-unowned-code")
        );
        assert!(
            employee_rows
                .iter()
                .all(|row| row["id"] != "contract-name-only")
        );
        assert!(
            employee_rows
                .iter()
                .all(|row| row["id"] != "contract-conflicting-owner")
        );
        let row = employee_rows
            .iter()
            .find(|row| row["id"] == "contract-owned")
            .expect("owned contract");
        assert_eq!(row["employeeSignStatus"], "Đã ký");
        assert_eq!(row["signatureVerificationStatus"], "unverified");
        for omitted in [
            "salary",
            "employeePhone",
            "employeeIdNumber",
            "partyBPhone",
            "fileNodeId",
            "customFieldValues",
        ] {
            assert!(row.get(omitted).is_none(), "unexpected {omitted} field");
        }
        assert!(!employee_json.to_string().contains("secret-envelope"));

        let outsider_response = call(
            &app,
            Method::GET,
            "/api/v1/contracts",
            Some(&outsider_token),
        )
        .await;
        assert_eq!(outsider_response.status(), StatusCode::OK);
        assert_eq!(
            body(outsider_response).await["data"]
                .as_array()
                .unwrap()
                .len(),
            0
        );

        let admin_response = call(&app, Method::GET, "/api/v1/contracts", Some(&admin_token)).await;
        assert_eq!(admin_response.status(), StatusCode::OK);
        assert_eq!(
            body(admin_response).await["data"].as_array().unwrap().len(),
            4
        );
    }

    #[tokio::test]
    async fn contract_detail_hides_foreign_records_and_generic_collection_access_is_disabled() {
        let (app, state, admin, employee, outsider) = fixture();
        let employee_token = bearer(&state, &employee);
        let outsider_token = bearer(&state, &outsider);
        let admin_token = bearer(&state, &admin);

        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-owned",
                Some(&employee_token),
            )
            .await
            .status(),
            StatusCode::OK
        );
        let owned_detail = body(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-owned",
                Some(&employee_token),
            )
            .await,
        )
        .await;
        assert_eq!(owned_detail["contract"]["isFull"], true);
        assert_eq!(owned_detail["contract"]["employeePhone"], "0900123456");
        assert_eq!(owned_detail["contract"]["salary"], 80_000_000);

        let admin_detail = body(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-owned",
                Some(&admin_token),
            )
            .await,
        )
        .await;
        assert_eq!(admin_detail["contract"]["isFull"], true);
        assert_eq!(admin_detail["contract"]["employeePhone"], "0900123456");
        assert_eq!(admin_detail["contract"]["salary"], 80_000_000);

        let mut keyless_state = state.clone();
        keyless_state.crm_crypto = None;
        let keyless_app = crate::router(keyless_state, CorsLayer::new());
        let keyless_response = call(
            &keyless_app,
            Method::GET,
            "/api/v1/contracts/contract-owned",
            Some(&employee_token),
        )
        .await;
        assert_eq!(keyless_response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(
            !body(keyless_response)
                .await
                .to_string()
                .contains("0900123456")
        );

        let unowned_detail = body(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-unowned-code",
                Some(&employee_token),
            )
            .await,
        )
        .await;
        assert_eq!(unowned_detail["contract"]["isFull"], false);
        assert!(unowned_detail["contract"].get("employeePhone").is_none());
        assert!(unowned_detail["contract"].get("salary").is_none());
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-name-only",
                Some(&employee_token),
            )
            .await
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/contracts/contract-owned",
                Some(&outsider_token),
            )
            .await
            .status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/contracts",
                Some(&admin_token),
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call_json(
                &app,
                Method::PUT,
                "/api/v1/collections/contracts",
                Some(&admin_token),
                json!({"records": []}),
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call_json(
                &app,
                Method::POST,
                "/api/v1/contracts",
                Some(&admin_token),
                json!({}),
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[tokio::test]
    async fn contract_admin_can_create_update_and_soft_archive_without_faking_signatures() {
        let (app, state, admin, employee, _) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let payload = json!({
            "name": "Hợp đồng thử nghiệm",
            "contractTemplate": "Mẫu chuẩn",
            "employeeCode": "EMP-CONTRACT-001",
            "employeeName": "Matching Name",
            "employeePhone": "0912345678",
            "partyBPhone": "0987654321",
            "salary": 25000000,
            "status": "Dự thảo"
        });

        assert_eq!(
            call_json(
                &app,
                Method::POST,
                "/api/v1/contracts",
                Some(&employee_token),
                payload.clone(),
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let forbidden_status = call_json(
            &app,
            Method::POST,
            "/api/v1/contracts",
            Some(&admin_token),
            json!({
                "name": "Invalid active contract",
                "contractTemplate": "Mẫu chuẩn",
                "status": "Còn hiệu lực"
            }),
        )
        .await;
        assert_eq!(forbidden_status.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let created = call_json(
            &app,
            Method::POST,
            "/api/v1/contracts",
            Some(&admin_token),
            payload,
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = body(created).await["contract"].clone();
        let id = created["id"]
            .as_str()
            .expect("created contract id")
            .to_owned();
        assert!(created["code"].as_str().unwrap().starts_with("HD-"));
        assert_eq!(created["status"], "Dự thảo");
        assert_eq!(created["employeeSignStatus"], "Chưa ký");
        assert_eq!(created["companySignStatus"], "Chưa ký");
        assert_eq!(created["signatureVerificationStatus"], "unverified");
        assert_eq!(created["employeePhone"], "0912345678");

        let stored_phone: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT employee_phone FROM contracts WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .expect("encrypted contract phone");
        assert!(stored_phone.starts_with("ENC:{"));

        let updated = call_json(
            &app,
            Method::PATCH,
            &format!("/api/v1/contracts/{id}"),
            Some(&admin_token),
            json!({
                "code": "HD-CONTRACT-RENAMED",
                "name": "Hợp đồng đã cập nhật",
                "contractTemplate": "Mẫu chuẩn",
                "employeeCode": "EMP-CONTRACT-001",
                "employeePhone": "0900000000",
                "signerName": "Người đại diện",
                "signerPosition": "Giám đốc",
                "status": "Chờ duyệt"
            }),
        )
        .await;
        assert_eq!(updated.status(), StatusCode::OK);
        let updated = body(updated).await["contract"].clone();
        assert_eq!(updated["code"], "HD-CONTRACT-RENAMED");
        assert_eq!(updated["name"], "Hợp đồng đã cập nhật");
        assert_eq!(updated["employeePhone"], "0900000000");
        assert_eq!(updated["status"], "Chờ duyệt");
        assert_eq!(updated["signerName"], "Người đại diện");
        assert_eq!(updated["signerPosition"], "Giám đốc");
        assert_eq!(updated["employeeSignStatus"], "Chưa ký");

        let archived = call(
            &app,
            Method::DELETE,
            &format!("/api/v1/contracts/{id}"),
            Some(&admin_token),
        )
        .await;
        assert_eq!(archived.status(), StatusCode::OK);
        assert_eq!(body(archived).await["archived"], true);
        assert_eq!(
            call(
                &app,
                Method::GET,
                &format!("/api/v1/contracts/{id}"),
                Some(&admin_token),
            )
            .await
            .status(),
            StatusCode::NOT_FOUND
        );
        let rows =
            body(call(&app, Method::GET, "/api/v1/contracts", Some(&admin_token)).await).await;
        assert!(
            rows["data"]
                .as_array()
                .unwrap()
                .iter()
                .all(|row| row["id"] != id)
        );
    }
}
