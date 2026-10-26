use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

pub fn install_schema(db: &Connection) -> anyhow::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS finance_cash_transactions (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Thu', 'Chi')),
            source TEXT NOT NULL CHECK (source IN ('bank', 'petty')),
            category TEXT NOT NULL,
            amount BIGINT NOT NULL CHECK (amount > 0),
            transaction_date TEXT NOT NULL,
            counterparty TEXT NOT NULL,
            account_name TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('Đã hoàn thành', 'Chờ duyệt', 'Đã hủy')),
            note TEXT NOT NULL DEFAULT '',
            department TEXT,
            employee_code TEXT,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS finance_cash_transactions_date_idx
            ON finance_cash_transactions(transaction_date DESC, created_at DESC);
        CREATE INDEX IF NOT EXISTS finance_cash_transactions_source_idx
            ON finance_cash_transactions(source, transaction_type, status);
        CREATE INDEX IF NOT EXISTS finance_cash_transactions_code_idx
            ON finance_cash_transactions(LOWER(code));

        CREATE TABLE IF NOT EXISTS finance_bank_accounts (
            id TEXT PRIMARY KEY,
            bank_name TEXT NOT NULL,
            account_number TEXT NOT NULL UNIQUE,
            account_holder TEXT NOT NULL,
            branch TEXT NOT NULL DEFAULT '',
            opening_balance BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
            status TEXT NOT NULL DEFAULT 'Đang hoạt động',
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS finance_bank_accounts_bank_idx
            ON finance_bank_accounts(LOWER(bank_name));
        CREATE INDEX IF NOT EXISTS finance_bank_accounts_acc_idx
            ON finance_bank_accounts(LOWER(account_number));

        CREATE TABLE IF NOT EXISTS finance_bank_transfers (
            id TEXT PRIMARY KEY,
            idempotency_key TEXT NOT NULL,
            source_account_id TEXT NOT NULL REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT,
            destination_account_id TEXT NOT NULL REFERENCES finance_bank_accounts(id) ON DELETE RESTRICT,
            amount BIGINT NOT NULL CHECK (amount > 0),
            note TEXT NOT NULL DEFAULT '',
            debit_transaction_id TEXT NOT NULL UNIQUE REFERENCES finance_cash_transactions(id) ON DELETE RESTRICT,
            credit_transaction_id TEXT NOT NULL UNIQUE REFERENCES finance_cash_transactions(id) ON DELETE RESTRICT,
            created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            UNIQUE(created_by, idempotency_key),
            CHECK (source_account_id <> destination_account_id)
        );
        CREATE INDEX IF NOT EXISTS finance_bank_transfers_created_idx
            ON finance_bank_transfers(created_at DESC, id DESC);",
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct FinanceBankAccount {
    pub key: String,
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub balance: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateFinanceBankAccountInput {
    bank_name: String,
    account_number: String,
    account_holder: String,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    balance: Option<Value>,
    #[serde(default)]
    status: Option<String>,
}

fn validate_bank_account(
    input: CreateFinanceBankAccountInput,
) -> ApiResult<(String, String, String, String, i64, String)> {
    let bank_name = required_text(input.bank_name, "Tên ngân hàng", 200)?;
    let account_number = required_text(input.account_number, "Số tài khoản", 64)?;
    let account_holder = required_text(input.account_holder, "Chủ tài khoản", 200)?;
    let branch = optional_text(input.branch, "Chi nhánh", 200)?;
    let balance = optional_bank_balance(input.balance)?;
    let status = input.status.filter(|status| !status.is_empty());
    let status = required_text(
        status.unwrap_or_else(|| "Đang hoạt động".to_owned()),
        "Trạng thái",
        80,
    )?;
    Ok((
        bank_name,
        account_number,
        account_holder,
        branch,
        balance,
        status,
    ))
}

fn optional_bank_balance(value: Option<Value>) -> ApiResult<i64> {
    let amount = match value {
        None | Some(Value::Null) => return Ok(0),
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::String(text)) if text.trim().is_empty() => return Ok(0),
        Some(Value::String(text)) => text.trim().parse::<f64>().ok(),
        _ => None,
    };
    let Some(amount) = amount else {
        return Err(ApiError::unprocessable(
            "Số dư ban đầu phải là số nguyên không âm hợp lệ.",
        ));
    };
    if !amount.is_finite()
        || amount.fract() != 0.0
        || !(0.0..=1_000_000_000_000.0).contains(&amount)
    {
        return Err(ApiError::unprocessable(
            "Số dư ban đầu phải là số nguyên từ 0 đến 1.000.000.000.000.",
        ));
    }
    Ok(amount as i64)
}

const SELECT_BANK_ACCOUNT: &str = "SELECT id,bank_name,account_number,account_holder,branch,
    opening_balance,status,created_at,updated_at FROM finance_bank_accounts";

pub(super) async fn list_bank_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(&format!("{SELECT_BANK_ACCOUNT} ORDER BY created_at DESC"))
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            let encrypted_number: String = row.get(2)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                encrypted_number,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let mut accounts = Vec::new();
    for row in rows {
        let row = row.map_err(ApiError::internal)?;
        let encrypted_number = row.2;
        accounts.push(FinanceBankAccount {
            key: row.0,
            bank_name: row.1,
            account_number: crate::crm::decrypt_finance_field(
                &encrypted_number,
                state.crm_crypto.as_ref(),
            )?,
            account_holder: row.3,
            branch: row.4,
            balance: row.5,
            status: row.6,
            created_at: row.7,
            updated_at: row.8,
        });
    }
    Ok(Json(json!({ "data": accounts })))
}

pub(super) async fn create_bank_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateFinanceBankAccountInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (bank_name, account_number, account_holder, branch, balance, status) =
        validate_bank_account(input)?;
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("Thiếu khóa mã hóa để lưu số tài khoản ngân hàng an toàn.")
    })?;
    let encrypted_number = crate::crm::encrypt_finance_field(&account_number, crypto)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    {
        let mut statement = transaction
            .prepare("SELECT account_number FROM finance_bank_accounts")
            .map_err(ApiError::internal)?;
        let numbers = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?;
        for number in numbers {
            let stored = number.map_err(ApiError::internal)?;
            let plaintext = crate::crm::decrypt_finance_field(&stored, Some(crypto))?;
            if plaintext == account_number {
                return Err(ApiError::conflict(
                    "Số tài khoản này đã được khai báo cho một tài khoản ngân hàng khác.",
                ));
            }
        }
    }
    transaction
        .execute(
            "INSERT INTO finance_bank_accounts
             (id,bank_name,account_number,account_holder,branch,opening_balance,status,created_by,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![
                id,
                bank_name,
                encrypted_number,
                account_holder,
                branch,
                balance,
                status,
                actor.id,
                timestamp,
            ],
        )
        .map_err(|error| {
            if error.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
                ApiError::conflict("Số tài khoản ngân hàng đã tồn tại.")
            } else {
                ApiError::internal(error)
            }
        })?;
    let account = transaction
        .query_row(
            &format!("{SELECT_BANK_ACCOUNT} WHERE id = ?1"),
            params![id],
            |row| {
                let encrypted_number: String = row.get(2)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    encrypted_number,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .map_err(ApiError::internal)?;
    let account = FinanceBankAccount {
        key: account.0,
        bank_name: account.1,
        account_number: crate::crm::decrypt_finance_field(&account.2, Some(crypto))?,
        account_holder: account.3,
        branch: account.4,
        balance: account.5,
        status: account.6,
        created_at: account.7,
        updated_at: account.8,
    };
    crate::audit::append_event(
        &transaction,
        &actor,
        "create",
        "Tài khoản ngân hàng",
        &account.key,
        json!({}),
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "account": account }))))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateBankTransferInput {
    idempotency_key: String,
    from_account_key: String,
    to_account_key: String,
    amount: i64,
    #[serde(default)]
    note: Option<String>,
}

fn validate_bank_transfer(
    input: CreateBankTransferInput,
) -> ApiResult<(String, String, String, i64, String)> {
    let idempotency_key = required_text(input.idempotency_key, "Khóa yêu cầu", 128)?;
    let from_account_key = required_text(input.from_account_key, "Tài khoản nguồn", 128)?;
    let to_account_key = required_text(input.to_account_key, "Tài khoản đích", 128)?;
    if from_account_key == to_account_key {
        return Err(ApiError::unprocessable(
            "Tài khoản nguồn và tài khoản đích không được trùng nhau.",
        ));
    }
    if !(10_000..=1_000_000_000_000).contains(&input.amount) {
        return Err(ApiError::unprocessable(
            "Số tiền chuyển phải từ 10.000 đến 1.000.000.000.000 VND.",
        ));
    }
    let note = optional_text(input.note, "Nội dung điều chuyển", 2_000)?;
    Ok((
        idempotency_key,
        from_account_key,
        to_account_key,
        input.amount,
        note,
    ))
}

fn bank_transfer_response(
    db: &Connection,
    transfer_key: &str,
    from_account_key: &str,
    to_account_key: &str,
    amount: i64,
    note: &str,
    date: &str,
    debit_id: &str,
    credit_id: &str,
    replayed: bool,
) -> ApiResult<Value> {
    Ok(json!({
        "transfer": {
            "key": transfer_key,
            "fromAccountKey": from_account_key,
            "toAccountKey": to_account_key,
            "amount": amount,
            "note": note,
            "date": date,
            "debit": transaction_by_id(db, debit_id)?,
            "credit": transaction_by_id(db, credit_id)?,
            "replayed": replayed
        }
    }))
}

pub(super) async fn create_bank_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateBankTransferInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (idempotency_key, from_account_key, to_account_key, amount, note) =
        validate_bank_transfer(input)?;
    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    let date = now.format("%Y-%m-%d").to_string();
    let date_code = now.format("%Y%m%d").to_string();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;

    let prior = transaction
        .query_row(
            "SELECT id,source_account_id,destination_account_id,amount,note,
                    debit_transaction_id,credit_transaction_id
             FROM finance_bank_transfers WHERE created_by = ?1 AND idempotency_key = ?2",
            params![actor.id, idempotency_key],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?;
    if let Some(prior) = prior {
        if prior.1 != from_account_key
            || prior.2 != to_account_key
            || prior.3 != amount
            || prior.4 != note
        {
            return Err(ApiError::conflict(
                "Khóa yêu cầu chuyển tiền đã được dùng cho nội dung khác.",
            ));
        }
        let date = transaction
            .query_row(
                "SELECT transaction_date FROM finance_cash_transactions WHERE id = ?1",
                params![prior.5],
                |row| row.get::<_, String>(0),
            )
            .map_err(ApiError::internal)?;
        let response = bank_transfer_response(
            &transaction,
            &prior.0,
            &prior.1,
            &prior.2,
            prior.3,
            &prior.4,
            &date,
            &prior.5,
            &prior.6,
            true,
        )?;
        transaction.commit().map_err(ApiError::internal)?;
        return Ok((StatusCode::OK, Json(response)));
    }

    let from_bank: String = transaction
        .query_row(
            "SELECT bank_name FROM finance_bank_accounts WHERE id = ?1",
            params![from_account_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy tài khoản ngân hàng nguồn."))?;
    let to_bank: String = transaction
        .query_row(
            "SELECT bank_name FROM finance_bank_accounts WHERE id = ?1",
            params![to_account_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy tài khoản ngân hàng đích."))?;

    let debit_id = Uuid::new_v4().to_string();
    let credit_id = Uuid::new_v4().to_string();
    let transfer_id = Uuid::new_v4().to_string();
    let debit_code = generated_code(&transaction, "PC", &date_code)?;
    let credit_code = generated_code(&transaction, "PT", &date_code)?;
    let debit_note = format!("Chuyển sang {to_bank}: {note}");
    let credit_note = format!("Nhận từ {from_bank}: {note}");

    transaction
        .execute(
            "INSERT INTO finance_cash_transactions
             (id,code,transaction_type,source,category,amount,transaction_date,counterparty,
              account_name,status,note,department,employee_code,created_by,created_at,updated_at)
             VALUES (?1,?2,'Chi','bank','Chuyển tiền nội bộ',?3,?4,?5,?6,
                     'Đã hoàn thành',?7,NULL,NULL,?8,?9,?9)",
            params![
                debit_id, debit_code, amount, date, to_bank, from_bank, debit_note, actor.id,
                timestamp,
            ],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO finance_cash_transactions
             (id,code,transaction_type,source,category,amount,transaction_date,counterparty,
              account_name,status,note,department,employee_code,created_by,created_at,updated_at)
             VALUES (?1,?2,'Thu','bank','Chuyển tiền nội bộ',?3,?4,?5,?6,
                     'Đã hoàn thành',?7,NULL,NULL,?8,?9,?9)",
            params![
                credit_id,
                credit_code,
                amount,
                date,
                from_bank,
                to_bank,
                credit_note,
                actor.id,
                timestamp,
            ],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO finance_bank_transfers
             (id,idempotency_key,source_account_id,destination_account_id,amount,note,
              debit_transaction_id,credit_transaction_id,created_by,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                transfer_id,
                idempotency_key,
                from_account_key,
                to_account_key,
                amount,
                note,
                debit_id,
                credit_id,
                actor.id,
                timestamp,
            ],
        )
        .map_err(ApiError::internal)?;

    let response = bank_transfer_response(
        &transaction,
        &transfer_id,
        &from_account_key,
        &to_account_key,
        amount,
        &note,
        &date,
        &debit_id,
        &credit_id,
        false,
    )?;
    crate::audit::append_event(
        &transaction,
        &actor,
        "create",
        "Điều chuyển nội bộ",
        &transfer_id,
        json!({}),
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(response)))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct CashTransaction {
    pub key: String,
    pub code: String,
    #[serde(rename = "type")]
    pub transaction_type: String,
    pub source: String,
    pub category: String,
    pub amount: i64,
    pub date: String,
    pub recipient_or_payer: String,
    pub account: String,
    pub status: String,
    pub note: String,
    pub department: String,
    pub employee_code: String,
    pub created_at: String,
    pub updated_at: String,
}

fn transaction_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CashTransaction> {
    Ok(CashTransaction {
        key: row.get(0)?,
        code: row.get(1)?,
        transaction_type: row.get(2)?,
        source: row.get(3)?,
        category: row.get(4)?,
        amount: row.get(5)?,
        date: row.get(6)?,
        recipient_or_payer: row.get(7)?,
        account: row.get(8)?,
        status: row.get(9)?,
        note: row.get(10)?,
        department: row.get::<_, Option<String>>(11)?.unwrap_or_default(),
        employee_code: row.get::<_, Option<String>>(12)?.unwrap_or_default(),
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const SELECT_TRANSACTION: &str = "SELECT id,code,transaction_type,source,category,amount,
    transaction_date,counterparty,account_name,status,note,department,employee_code,created_at,updated_at
    FROM finance_cash_transactions";

fn transaction_by_id(db: &Connection, id: &str) -> ApiResult<CashTransaction> {
    db.query_row(
        &format!("{SELECT_TRANSACTION} WHERE id = ?1"),
        params![id],
        transaction_from_row,
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy chứng từ thu chi."))
}

#[derive(Debug, Deserialize, Default)]
pub(super) struct CashTransactionQuery {
    source: Option<String>,
}

pub(super) async fn list_cash_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CashTransactionQuery>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    if query
        .source
        .as_deref()
        .is_some_and(|source| !matches!(source, "bank" | "petty"))
    {
        return Err(ApiError::unprocessable("Nguồn tiền không hợp lệ."));
    }

    let db = state.db.lock().await;
    let sql = if query.source.is_some() {
        format!(
            "{SELECT_TRANSACTION} WHERE source = ?1 ORDER BY transaction_date DESC, created_at DESC, id DESC"
        )
    } else {
        format!("{SELECT_TRANSACTION} ORDER BY transaction_date DESC, created_at DESC, id DESC")
    };
    let mut statement = db.prepare(&sql).map_err(ApiError::internal)?;
    let transactions = statement
        .query_map(
            rusqlite::params_from_iter(query.source.iter()),
            transaction_from_row,
        )
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": transactions })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateCashTransactionInput {
    // The legacy UI requires a code field, but the legacy server ignores it and generates one.
    #[serde(default)]
    code: Option<String>,
    #[serde(rename = "type")]
    transaction_type: String,
    #[serde(default)]
    source: Option<String>,
    category: String,
    amount: i64,
    date: String,
    recipient_or_payer: String,
    account: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    department: Option<String>,
    #[serde(default)]
    employee_code: Option<String>,
}

fn required_text(value: String, label: &str, maximum: usize) -> ApiResult<String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(ApiError::unprocessable(format!("{label} là bắt buộc.")));
    }
    if normalized.chars().count() > maximum {
        return Err(ApiError::unprocessable(format!(
            "{label} vượt quá độ dài cho phép."
        )));
    }
    Ok(normalized.to_owned())
}

fn optional_text(value: Option<String>, label: &str, maximum: usize) -> ApiResult<String> {
    let normalized = value.unwrap_or_default();
    let normalized = normalized.trim();
    if normalized.chars().count() > maximum {
        return Err(ApiError::unprocessable(format!(
            "{label} vượt quá độ dài cho phép."
        )));
    }
    Ok(normalized.to_owned())
}

fn validate_input(
    input: CreateCashTransactionInput,
) -> ApiResult<(
    String,
    String,
    String,
    i64,
    String,
    String,
    String,
    String,
    String,
    String,
    String,
)> {
    let _legacy_code = input.code;
    if !matches!(input.transaction_type.as_str(), "Thu" | "Chi") {
        return Err(ApiError::unprocessable("Loại chứng từ không hợp lệ."));
    }
    let source = input.source.unwrap_or_else(|| "bank".to_owned());
    if !matches!(source.as_str(), "bank" | "petty") {
        return Err(ApiError::unprocessable("Nguồn tiền không hợp lệ."));
    }
    let category = required_text(input.category, "Nội dung thu chi", 500)?;
    if !(1..=1_000_000_000_000).contains(&input.amount) {
        return Err(ApiError::unprocessable(
            "Số tiền phải là số nguyên dương hợp lệ.",
        ));
    }
    let date = required_text(input.date, "Ngày hạch toán", 10)?;
    let parsed_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày hạch toán không đúng định dạng YYYY-MM-DD."))?;
    if parsed_date.format("%Y-%m-%d").to_string() != date {
        return Err(ApiError::unprocessable(
            "Ngày hạch toán không đúng định dạng YYYY-MM-DD.",
        ));
    }
    let recipient_or_payer =
        required_text(input.recipient_or_payer, "Đối tác hoặc người nhận", 200)?;
    let account = required_text(input.account, "Tài khoản hoặc quỹ tiền", 200)?;
    let status = input.status.unwrap_or_else(|| "Chờ duyệt".to_owned());
    if !matches!(status.as_str(), "Đã hoàn thành" | "Chờ duyệt" | "Đã hủy") {
        return Err(ApiError::unprocessable("Trạng thái không hợp lệ."));
    }
    let note = optional_text(input.note, "Ghi chú", 2_000)?;
    let department = optional_text(input.department, "Phòng ban", 160)?;
    let employee_code = optional_text(input.employee_code, "Mã nhân viên", 64)?.to_uppercase();
    Ok((
        input.transaction_type,
        source,
        category,
        input.amount,
        date,
        recipient_or_payer,
        account,
        status,
        note,
        department,
        employee_code,
    ))
}

fn generated_code(connection: &Connection, prefix: &str, date: &str) -> ApiResult<String> {
    for _ in 0..10 {
        let suffix = Uuid::new_v4().simple().to_string().to_ascii_uppercase();
        let code = format!("{prefix}-{date}-{}", &suffix[..8]);
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM finance_cash_transactions WHERE code = ?1)",
                params![code],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if !exists {
            return Ok(code);
        }
    }
    Err(ApiError::internal(
        "Không thể tạo mã hệ thống. Vui lòng thử lại.",
    ))
}

pub(super) async fn create_cash_transaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateCashTransactionInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (
        transaction_type,
        source,
        category,
        amount,
        date,
        recipient_or_payer,
        account,
        status,
        note,
        department,
        employee_code,
    ) = validate_input(input)?;
    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    let date_code = now.format("%Y%m%d").to_string();
    let prefix = if transaction_type == "Thu" {
        "PT"
    } else {
        "PC"
    };
    let id = Uuid::new_v4().to_string();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let code = generated_code(&transaction, prefix, &date_code)?;
    transaction
        .execute(
            "INSERT INTO finance_cash_transactions
             (id,code,transaction_type,source,category,amount,transaction_date,counterparty,
              account_name,status,note,department,employee_code,created_by,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)",
            params![
                id,
                code,
                transaction_type,
                source,
                category,
                amount,
                date,
                recipient_or_payer,
                account,
                status,
                note,
                (!department.is_empty()).then_some(department),
                (!employee_code.is_empty()).then_some(employee_code),
                actor.id,
                timestamp,
            ],
        )
        .map_err(ApiError::internal)?;
    let transaction_record = transaction_by_id(&transaction, &id)?;
    crate::audit::append_event(
        &transaction,
        &actor,
        "create",
        "Phiếu thu chi",
        &id,
        json!({}),
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "transaction": transaction_record })),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CancelCashTransactionInput {
    status: String,
}

pub(super) async fn cancel_cash_transaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transaction_id): Path<String>,
    Json(input): Json<CancelCashTransactionInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if input.status != "Đã hủy" {
        return Err(ApiError::unprocessable(
            "Chỉ hỗ trợ hủy chứng từ qua API này.",
        ));
    }
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE finance_cash_transactions SET status = 'Đã hủy', updated_at = ?1 WHERE id = ?2",
            params![Utc::now().to_rfc3339(), transaction_id],
        )
        .map_err(ApiError::internal)?;
    if changed == 0 {
        return Err(ApiError::not_found("Không tìm thấy chứng từ thu chi."));
    }
    let transaction_record = transaction_by_id(&transaction, &transaction_id)?;
    crate::audit::append_event(
        &transaction,
        &actor,
        "update",
        "Phiếu thu chi",
        &transaction_id,
        json!({"status":"Đã hủy"}),
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "transaction": transaction_record })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Request, header::AUTHORIZATION},
    };
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use std::{path::PathBuf, sync::Arc};
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    use crate::{ADMIN_ROLE, AppState, User};

    fn setup() -> (AppState, User, User) {
        setup_with_crypto(false)
    }

    fn setup_with_crypto(with_crypto: bool) -> (AppState, User, User) {
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let now = Utc::now().to_rfc3339();
        let admin = test_user("finance-admin", "Finance Admin", ADMIN_ROLE, &now);
        let employee = test_user("finance-user", "Finance User", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'unused',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            )
            .unwrap();
        }
        let secret = b"finance-route-test-secret-long-enough";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: EncodingKey::from_secret(secret),
            jwt_decoding: DecodingKey::from_secret(secret),
            storage_dir: Arc::new(PathBuf::from("test-storage")),
            crm_crypto: with_crypto.then(|| crate::crm::CrmCrypto::for_test([0x42; 32], "v1")),
        };
        (state, admin, employee)
    }

    fn test_user(id: &str, name: &str, role: &str, now: &str) -> User {
        User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        }
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", crate::issue_token(state, user).unwrap())
    }

    #[test]
    fn bank_account_validation_preserves_legacy_empty_defaults_and_numeric_strings() {
        let input: CreateFinanceBankAccountInput = serde_json::from_value(json!({
            "bankName": "Bank",
            "accountNumber": "00123",
            "accountHolder": "Holder",
            "balance": "1e3",
            "status": ""
        }))
        .expect("legacy-compatible account input");
        let validated = validate_bank_account(input).expect("valid bank account");
        assert_eq!(validated.4, 1_000);
        assert_eq!(validated.5, "Đang hoạt động");

        for balance in [json!("1.5"), json!("1000000000001"), json!(true)] {
            let input: CreateFinanceBankAccountInput = serde_json::from_value(json!({
                "bankName": "Bank",
                "accountNumber": "00123",
                "accountHolder": "Holder",
                "balance": balance
            }))
            .expect("JSON value remains deserializable for validation");
            assert_eq!(
                validate_bank_account(input).unwrap_err().0,
                StatusCode::UNPROCESSABLE_ENTITY
            );
        }
    }

    #[tokio::test]
    async fn bank_account_routes_are_admin_only_and_encrypt_account_numbers_at_rest() {
        let (state, admin, employee) = setup_with_crypto(true);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let request_body = json!({
            "bankName": "Ngân hàng thử nghiệm",
            "accountNumber": "0123456789",
            "accountHolder": "NGUYEN VAN A",
            "branch": "Chi nhánh Hà Nội",
            "balance": 1250000
        });
        let created = app
            .clone()
            .oneshot(
                Request::post("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .header("content-type", "application/json")
                    .body(Body::from(request_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(created.status(), StatusCode::CREATED);
        let created_body = serde_json::from_slice::<Value>(
            &to_bytes(created.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        let account = &created_body["account"];
        assert_eq!(account["bankName"], "Ngân hàng thử nghiệm");
        assert_eq!(account["accountNumber"], "0123456789");
        assert_eq!(account["accountHolder"], "NGUYEN VAN A");
        assert_eq!(account["branch"], "Chi nhánh Hà Nội");
        assert_eq!(account["balance"], 1_250_000);
        assert_eq!(account["status"], "Đang hoạt động");
        assert!(account["key"].as_str().is_some_and(|key| !key.is_empty()));

        let stored: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT account_number FROM finance_bank_accounts WHERE id = ?1",
                params![account["key"].as_str().unwrap()],
                |row| row.get(0),
            )
            .unwrap();
        assert!(stored.starts_with("ENC:{"));
        assert!(!stored.contains("0123456789"));

        let listed = app
            .clone()
            .oneshot(
                Request::get("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(listed.status(), StatusCode::OK);
        let listed_body = serde_json::from_slice::<Value>(
            &to_bytes(listed.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        assert_eq!(listed_body["data"][0]["accountNumber"], "0123456789");

        let forbidden_list = app
            .clone()
            .oneshot(
                Request::get("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &employee))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(forbidden_list.status(), StatusCode::FORBIDDEN);

        let forbidden_create = app
            .oneshot(
                Request::post("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &employee))
                    .header("content-type", "application/json")
                    .body(Body::from(request_body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(forbidden_create.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn bank_accounts_reject_duplicate_plaintext_and_invalid_amounts() {
        let (state, admin, _) = setup_with_crypto(true);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let body = json!({
            "bankName": "Ngân hàng thử nghiệm",
            "accountNumber": "0123456789",
            "accountHolder": "NGUYEN VAN A"
        });
        let create = || {
            app.clone().oneshot(
                Request::post("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
        };
        assert_eq!(create().await.unwrap().status(), StatusCode::CREATED);
        assert_eq!(create().await.unwrap().status(), StatusCode::CONFLICT);

        for balance in [-1_i64, 1_000_000_000_001_i64] {
            let invalid = app
                .clone()
                .oneshot(
                    Request::post("/api/v1/finance/bank-accounts")
                        .header(AUTHORIZATION, bearer(&state, &admin))
                        .header("content-type", "application/json")
                        .body(Body::from(
                            json!({
                                "bankName": "Bank",
                                "accountNumber": format!("invalid-{balance}"),
                                "accountHolder": "Holder",
                                "balance": balance
                            })
                            .to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);
        }
    }

    #[tokio::test]
    async fn bank_account_create_fails_closed_when_encryption_key_is_missing() {
        let (state, admin, _) = setup();
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let response = app
            .oneshot(
                Request::post("/api/v1/finance/bank-accounts")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "bankName": "Bank",
                            "accountNumber": "0123456789",
                            "accountHolder": "Holder"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let count: i64 = state
            .db
            .lock()
            .await
            .query_row("SELECT COUNT(*) FROM finance_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    async fn insert_test_bank_account(state: &AppState, id: &str, bank_name: &str) {
        let now = Utc::now().to_rfc3339();
        let crypto = state.crm_crypto.as_ref().expect("test crypto configured");
        let encrypted_number = crate::crm::encrypt_finance_field(&format!("number-{id}"), crypto)
            .expect("encrypt test account number");
        let db = state.db.lock().await;
        db.execute(
            "INSERT INTO finance_bank_accounts
             (id,bank_name,account_number,account_holder,branch,opening_balance,status,
              created_by,created_at,updated_at)
             VALUES (?1,?2,?3,'TEST HOLDER','',0,'Đang hoạt động','finance-admin',?4,?4)",
            params![id, bank_name, encrypted_number, now],
        )
        .expect("insert test account");
    }

    fn bank_transfer_request(
        state: &AppState,
        user: &User,
        idempotency_key: &str,
        from: &str,
        to: &str,
        amount: i64,
        note: &str,
    ) -> Request<Body> {
        Request::post("/api/v1/finance/bank-transfers")
            .header(AUTHORIZATION, bearer(state, user))
            .header("content-type", "application/json")
            .body(Body::from(
                json!({
                    "idempotencyKey": idempotency_key,
                    "fromAccountKey": from,
                    "toAccountKey": to,
                    "amount": amount,
                    "note": note
                })
                .to_string(),
            ))
            .unwrap()
    }

    #[tokio::test]
    async fn bank_transfer_creates_linked_vouchers_atomically_and_is_idempotent() {
        let (state, admin, employee) = setup_with_crypto(true);
        insert_test_bank_account(&state, "bank-source", "Ngân hàng nguồn").await;
        insert_test_bank_account(&state, "bank-destination", "Ngân hàng đích").await;
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let request = || {
            bank_transfer_request(
                &state,
                &admin,
                "transfer-request-1",
                "bank-source",
                "bank-destination",
                125_000,
                "Điều chuyển hợp đồng",
            )
        };

        let created = app.clone().oneshot(request()).await.unwrap();
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = serde_json::from_slice::<Value>(
            &to_bytes(created.into_body(), 32 * 1024).await.unwrap(),
        )
        .unwrap();
        let transfer = &body["transfer"];
        assert_eq!(transfer["amount"], 125_000);
        assert_eq!(transfer["replayed"], false);
        assert_eq!(transfer["debit"]["type"], "Chi");
        assert_eq!(transfer["debit"]["source"], "bank");
        assert_eq!(transfer["debit"]["account"], "Ngân hàng nguồn");
        assert_eq!(transfer["debit"]["recipientOrPayer"], "Ngân hàng đích");
        assert_eq!(
            transfer["debit"]["note"],
            "Chuyển sang Ngân hàng đích: Điều chuyển hợp đồng"
        );
        assert_eq!(transfer["credit"]["type"], "Thu");
        assert_eq!(transfer["credit"]["account"], "Ngân hàng đích");
        assert_eq!(transfer["credit"]["recipientOrPayer"], "Ngân hàng nguồn");
        assert_eq!(
            transfer["credit"]["note"],
            "Nhận từ Ngân hàng nguồn: Điều chuyển hợp đồng"
        );
        assert_eq!(transfer["debit"]["status"], "Đã hoàn thành");
        assert_eq!(transfer["credit"]["status"], "Đã hoàn thành");

        let replay = app.clone().oneshot(request()).await.unwrap();
        assert_eq!(replay.status(), StatusCode::OK);
        let replay = serde_json::from_slice::<Value>(
            &to_bytes(replay.into_body(), 32 * 1024).await.unwrap(),
        )
        .unwrap();
        assert_eq!(replay["transfer"]["replayed"], true);
        assert_eq!(
            replay["transfer"]["key"], transfer["key"],
            "retry returns the original transfer"
        );

        let conflict = app
            .clone()
            .oneshot(bank_transfer_request(
                &state,
                &admin,
                "transfer-request-1",
                "bank-source",
                "bank-destination",
                126_000,
                "Điều chuyển hợp đồng",
            ))
            .await
            .unwrap();
        assert_eq!(conflict.status(), StatusCode::CONFLICT);

        let below_minimum = app
            .clone()
            .oneshot(bank_transfer_request(
                &state,
                &admin,
                "transfer-request-small",
                "bank-source",
                "bank-destination",
                9_999,
                "Dưới giới hạn legacy",
            ))
            .await
            .unwrap();
        assert_eq!(below_minimum.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let same_account = app
            .clone()
            .oneshot(bank_transfer_request(
                &state,
                &admin,
                "transfer-request-same-account",
                "bank-source",
                "bank-source",
                125_000,
                "Tài khoản trùng",
            ))
            .await
            .unwrap();
        assert_eq!(same_account.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let missing_account = app
            .clone()
            .oneshot(bank_transfer_request(
                &state,
                &admin,
                "transfer-request-missing-account",
                "missing-source",
                "bank-destination",
                125_000,
                "Tài khoản không tồn tại",
            ))
            .await
            .unwrap();
        assert_eq!(missing_account.status(), StatusCode::NOT_FOUND);

        let forbidden = app
            .clone()
            .oneshot(bank_transfer_request(
                &state,
                &employee,
                "transfer-request-employee",
                "bank-source",
                "bank-destination",
                125_000,
                "Không được phép",
            ))
            .await
            .unwrap();
        assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);

        let db = state.db.lock().await;
        let voucher_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_cash_transactions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let transfer_count: i64 = db
            .query_row("SELECT COUNT(*) FROM finance_bank_transfers", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(voucher_count, 2);
        assert_eq!(transfer_count, 1);
    }

    #[tokio::test]
    async fn bank_transfer_rolls_back_debit_when_credit_insert_fails() {
        let (state, admin, _) = setup_with_crypto(true);
        insert_test_bank_account(&state, "bank-source", "Ngân hàng nguồn").await;
        insert_test_bank_account(&state, "bank-destination", "Ngân hàng đích").await;
        state
            .db
            .lock()
            .await
            .execute_batch(
                "CREATE TRIGGER fail_bank_transfer_credit
                 BEFORE INSERT ON finance_cash_transactions
                 WHEN NEW.category = 'Chuyển tiền nội bộ' AND NEW.transaction_type = 'Thu'
                 BEGIN SELECT RAISE(ABORT, 'forced transfer credit failure'); END;",
            )
            .unwrap();
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let response = app
            .oneshot(bank_transfer_request(
                &state,
                &admin,
                "transfer-request-rollback",
                "bank-source",
                "bank-destination",
                125_000,
                "Thử rollback",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let db = state.db.lock().await;
        let voucher_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_cash_transactions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let transfer_count: i64 = db
            .query_row("SELECT COUNT(*) FROM finance_bank_transfers", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(voucher_count, 0);
        assert_eq!(transfer_count, 0);
    }

    #[tokio::test]
    async fn cash_transaction_http_routes_enforce_admin_and_preserve_legacy_contract() {
        let (state, admin, employee) = setup();
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let today_code = Utc::now().format("%Y%m%d").to_string();
        let body = json!({
            "code": "CLIENT-CODE-IS-IGNORED",
            "type": "Thu",
            "source": "bank",
            "category": "Thanh toán hợp đồng",
            "amount": 240000000,
            "date": today,
            "recipientOrPayer": "Alpha Tech",
            "account": "Tài khoản ngân hàng 01",
            "status": "Đã hoàn thành",
            "note": "Hợp đồng #A-10",
            "department": "Tài chính",
            "employeeCode": "emp-007"
        });
        let create = app
            .clone()
            .oneshot(
                Request::post("/api/v1/finance/cash-transactions")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(create.status(), StatusCode::CREATED);
        let payload = serde_json::from_slice::<Value>(
            &to_bytes(create.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        let transaction = &payload["transaction"];
        assert_eq!(transaction["type"], "Thu");
        assert_eq!(transaction["amount"], 240000000);
        assert_eq!(transaction["employeeCode"], "EMP-007");
        assert!(
            transaction["code"]
                .as_str()
                .unwrap()
                .starts_with(&format!("PT-{today_code}-"))
        );
        assert_ne!(transaction["code"], "CLIENT-CODE-IS-IGNORED");

        let listed = app
            .clone()
            .oneshot(
                Request::get("/api/v1/finance/cash-transactions?source=bank")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(listed.status(), StatusCode::OK);
        let listed_body = serde_json::from_slice::<Value>(
            &to_bytes(listed.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        assert_eq!(listed_body["data"].as_array().unwrap().len(), 1);

        let expense = app
            .clone()
            .oneshot(
                Request::post("/api/v1/finance/cash-transactions")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "type": "Chi",
                            "source": "petty",
                            "category": "Chi phí văn phòng",
                            "amount": 70000000,
                            "date": today,
                            "recipientOrPayer": "Nhà cung cấp Beta",
                            "account": "Quỹ tiền mặt",
                            "status": "Đã hoàn thành"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(expense.status(), StatusCode::CREATED);

        for (suffix, expected_count) in [("", 2), ("?source=bank", 1), ("?source=petty", 1)] {
            let listed = app
                .clone()
                .oneshot(
                    Request::get(format!("/api/v1/finance/cash-transactions{suffix}"))
                        .header(AUTHORIZATION, bearer(&state, &admin))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(listed.status(), StatusCode::OK, "filter: {suffix}");
            let payload: Value =
                serde_json::from_slice(&to_bytes(listed.into_body(), 16 * 1024).await.unwrap())
                    .unwrap();
            assert_eq!(payload["data"].as_array().unwrap().len(), expected_count);
        }

        let dashboard_before_cancel = app
            .clone()
            .oneshot(
                Request::get("/api/v1/dashboard/stats")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let dashboard_before_cancel = serde_json::from_slice::<Value>(
            &to_bytes(dashboard_before_cancel.into_body(), 16 * 1024)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(dashboard_before_cancel["financialMetricsAvailable"], true);
        assert_eq!(dashboard_before_cancel["monthlyRevenue"], 240000000);
        assert_eq!(dashboard_before_cancel["monthlyExpense"], 70000000);

        let employee_list = app
            .clone()
            .oneshot(
                Request::get("/api/v1/finance/cash-transactions")
                    .header(AUTHORIZATION, bearer(&state, &employee))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(employee_list.status(), StatusCode::FORBIDDEN);

        let transaction_id = transaction["key"].as_str().unwrap();
        let cancel = app
            .clone()
            .oneshot(
                Request::patch(format!(
                    "/api/v1/finance/cash-transactions/{transaction_id}"
                ))
                .header(AUTHORIZATION, bearer(&state, &admin))
                .header("content-type", "application/json")
                .body(Body::from(json!({"status":"Đã hủy"}).to_string()))
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(cancel.status(), StatusCode::OK);
        let canceled = serde_json::from_slice::<Value>(
            &to_bytes(cancel.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        assert_eq!(canceled["transaction"]["status"], "Đã hủy");

        let dashboard = app
            .oneshot(
                Request::get("/api/v1/dashboard/stats")
                    .header(AUTHORIZATION, bearer(&state, &admin))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let dashboard = serde_json::from_slice::<Value>(
            &to_bytes(dashboard.into_body(), 16 * 1024).await.unwrap(),
        )
        .unwrap();
        assert_eq!(dashboard["financialMetricsAvailable"], true);
        assert_eq!(dashboard["monthlyRevenue"], 0);
        assert_eq!(dashboard["monthlyExpense"], 70000000);
    }

    #[tokio::test]
    async fn cash_transaction_validation_rejects_bad_money_date_source_and_status() {
        let (state, admin, _) = setup();
        for (amount, date, source, status) in [
            (0, "2026-10-08", "bank", "Chờ duyệt"),
            (1_000_000_000_001, "2026-10-08", "bank", "Chờ duyệt"),
            (1_000, "2026-02-30", "bank", "Chờ duyệt"),
            (1_000, "2026-10-08", "cash", "Chờ duyệt"),
            (1_000, "2026-10-08", "bank", "Đã xác nhận"),
        ] {
            let error = create_cash_transaction(
                State(state.clone()),
                {
                    let mut headers = HeaderMap::new();
                    headers.insert(AUTHORIZATION, bearer(&state, &admin).parse().unwrap());
                    headers
                },
                Json(CreateCashTransactionInput {
                    code: None,
                    transaction_type: "Thu".to_owned(),
                    source: Some(source.to_owned()),
                    category: "Doanh thu".to_owned(),
                    amount,
                    date: date.to_owned(),
                    recipient_or_payer: "Khách hàng".to_owned(),
                    account: "Tài khoản".to_owned(),
                    status: Some(status.to_owned()),
                    note: None,
                    department: None,
                    employee_code: None,
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(error.0, StatusCode::UNPROCESSABLE_ENTITY);
        }

        let db = state.db.lock().await;
        let count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_cash_transactions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }
}
