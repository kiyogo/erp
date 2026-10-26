use crate::models::{AdminUser, Employee, OrgUnit, Session, StorageMode, User};
use ehttp::{Request, Response};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

/// A platform-neutral request handle. The UI polls this handle from its egui
/// frame loop, so native and WebAssembly use exactly the same screen code.
pub type ApiTask<T> = Arc<Mutex<Option<Result<T, String>>>>;

#[derive(Clone, Default)]
pub struct ApiClient;

#[derive(Debug, Deserialize)]
struct LoginResponse {
    access_token: String,
    session_id: String,
    user: User,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthIntrospectionResponse {
    pub active: bool,
    pub user: User,
}

#[derive(Debug, Clone)]
pub enum AuthSessionCheck {
    Active(User),
    Invalid,
    Unavailable(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSessionRecord {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub issued_at: String,
    pub expires_at: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthSessionsResponse {
    pub data: Vec<AuthSessionRecord>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AttendanceShift {
    pub key: String,
    pub shift_code: String,
    pub shift_name: String,
    pub time_range: String,
    pub start_time: String,
    pub end_time: String,
    pub working_hours: f64,
    pub work_units: f64,
    pub break_time: String,
    pub applicable_to: String,
    pub allow_grace_minutes: u32,
    pub night_allowance_pct: f64,
    pub shift_category: String,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttendanceShiftsResponse {
    pub data: Vec<AttendanceShift>,
    #[serde(default)]
    pub revision: String,
}

fn deserialize_asset_text<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

fn deserialize_asset_flag<'de, D>(deserializer: D) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<bool>::deserialize(deserializer)?.unwrap_or(false))
}

fn deserialize_asset_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<i64>::deserialize(deserializer)?.unwrap_or_default())
}

fn deserialize_legacy_asset_money<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<Value>::deserialize(deserializer)?;
    let Some(value) = value else {
        return Ok(0);
    };
    if let Some(amount) = value.as_i64() {
        return Ok(amount);
    }
    if let Some(amount) = value.as_f64() {
        if amount.is_finite() && amount >= i64::MIN as f64 && amount <= i64::MAX as f64 {
            return Ok(amount.round() as i64);
        }
    }
    if let Some(text) = value.as_str() {
        let normalized = text
            .trim()
            .chars()
            .filter(|character| !matches!(character, '.' | ',' | ' ' | '\u{00a0}'))
            .collect::<String>();
        return normalized.parse::<i64>().map_err(serde::de::Error::custom);
    }
    Err(serde::de::Error::custom(
        "legacy money field is not an integer or numeric string",
    ))
}

fn deserialize_asset_values<'de, D>(deserializer: D) -> Result<Vec<Value>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<Vec<Value>>::deserialize(deserializer)?.unwrap_or_default())
}

fn deserialize_asset_records<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: DeserializeOwned,
{
    Option::<Vec<Value>>::deserialize(deserializer)?
        .unwrap_or_default()
        .into_iter()
        .map(serde_json::from_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(serde::de::Error::custom)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetItem {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub key: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub barcode: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub category: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub model: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub purchase_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub supplier: String,
    pub original_price: Value,
    pub depreciation_months: Value,
    pub accumulated_depreciation: Value,
    pub net_book_value: Value,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub location: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub assigned_to: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub department: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub warranty_expiry: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub specs: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub notes: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetItemsResponse {
    pub data: Vec<AssetItem>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct GenericCollectionResponse {
    #[serde(default)]
    pub data: Vec<Value>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenericRecordResponse {
    pub record: Value,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetAllocation {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub key: String,
    #[serde(rename = "type", deserialize_with = "deserialize_asset_text")]
    pub operation_type: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub ticket_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub category: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub serial_no: String,
    #[serde(default)]
    pub employee_id: Option<String>,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub employee_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub employee_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub department: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub position: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub handover_person: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub allocated_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub expected_return_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub purpose: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub condition: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub accessories: String,
    pub compensation_amount: Value,
    #[serde(deserialize_with = "deserialize_asset_flag")]
    pub signed_by_receiver: bool,
    #[serde(default)]
    pub signed_at: Option<String>,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub notes: String,
    #[serde(deserialize_with = "deserialize_asset_flag")]
    pub received_by_account: bool,
    #[serde(default)]
    pub received_at: Option<String>,
    #[serde(default)]
    pub received_by_user_id: Option<String>,
    #[serde(default)]
    pub received_by_name: Option<String>,
    #[serde(default)]
    pub acknowledgement_method: Option<String>,
    #[serde(default)]
    pub warehouse_received_at: Option<String>,
    #[serde(default)]
    pub warehouse_received_by_user_id: Option<String>,
    #[serde(default)]
    pub warehouse_received_by_name: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetAllocationsResponse {
    pub data: Vec<AssetAllocation>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetAllocationMutationResponse {
    pub allocation: AssetAllocation,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetTransfer {
    pub key: String,
    pub transfer_code: String,
    pub asset_code: String,
    pub asset_name: String,
    pub category: String,
    pub serial_no: String,
    pub original_price: Option<i64>,
    pub net_book_value: Option<i64>,
    pub from_location: String,
    pub from_department: String,
    pub from_custodian: String,
    pub to_location: String,
    pub to_department: String,
    pub to_custodian: String,
    pub carrier_name: String,
    pub tracking_code: String,
    pub shipping_cost: i64,
    pub transfer_date: String,
    pub expected_delivery_date: String,
    pub received_date: Option<String>,
    pub reason: String,
    pub approver: String,
    pub approved_at: Option<String>,
    pub status: String,
    pub condition: String,
    pub receive_condition: Option<String>,
    pub notes: String,
    pub rejection_reason: Option<String>,
    pub created_by_name: String,
    pub approved_by_name: Option<String>,
    pub receipt_recorded_by_name: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetTransfer {
    pub transfer_code: String,
    pub asset_code: String,
    pub asset_name: String,
    pub category: String,
    pub serial_no: String,
    pub original_price: Option<i64>,
    pub net_book_value: Option<i64>,
    pub from_location: String,
    pub from_department: String,
    pub from_custodian: String,
    pub to_location: String,
    pub to_department: String,
    pub to_custodian: String,
    pub carrier_name: String,
    pub tracking_code: String,
    pub shipping_cost: i64,
    pub transfer_date: String,
    pub expected_delivery_date: String,
    pub reason: String,
    pub condition: String,
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetTransfersResponse {
    pub data: Vec<AssetTransfer>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetTransferMutationResponse {
    pub transfer: AssetTransfer,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetMaintenanceChecklistItem {
    pub item: String,
    pub done: bool,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetMaintenance {
    pub key: String,
    pub maint_code: String,
    pub system_name: String,
    pub category: String,
    pub asset_codes: String,
    pub location: String,
    pub frequency: String,
    pub maintenance_type: String,
    pub sla_level: String,
    pub last_date: String,
    pub next_date: String,
    pub responsible_engineer: String,
    pub vendor_partner: String,
    pub checklist: Vec<AssetMaintenanceChecklistItem>,
    pub estimated_budget: i64,
    pub actual_cost: Option<i64>,
    pub status: String,
    pub health_score: Option<u8>,
    pub certificate_code: Option<String>,
    pub notes: String,
    pub performed_at: Option<String>,
    pub performed_by_name: Option<String>,
    pub maintenance_history: Vec<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetMaintenance {
    pub maint_code: String,
    pub system_name: String,
    pub category: String,
    pub asset_codes: String,
    pub location: String,
    pub frequency: String,
    pub maintenance_type: String,
    pub sla_level: String,
    pub last_date: String,
    pub next_date: String,
    pub responsible_engineer: String,
    pub vendor_partner: String,
    pub estimated_budget: i64,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformAssetMaintenance {
    pub checklist: Vec<AssetMaintenanceChecklistItem>,
    pub health_score: u8,
    pub actual_cost: i64,
    pub notes: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetMaintenancesResponse {
    pub data: Vec<AssetMaintenance>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetMaintenanceMutationResponse {
    pub maintenance: AssetMaintenance,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetRepair {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub key: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub repair_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub category: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub serial_no: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub requester: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub department: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub severity: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub repair_unit: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub vendor: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub vendor_contact: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub issue_description: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub root_cause: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub solution: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub replaced_parts: String,
    #[serde(deserialize_with = "deserialize_asset_i64")]
    pub estimated_cost: i64,
    #[serde(deserialize_with = "deserialize_asset_i64")]
    pub actual_cost: i64,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub cost_bearing: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub start_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub expected_end_date: String,
    pub completed_date: Option<String>,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub warranty_after_repair: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub approver: String,
    pub approved_at: Option<String>,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub notes: String,
    pub created_by_name: Option<String>,
    pub approved_by_name: Option<String>,
    pub completed_by_name: Option<String>,
    pub repair_completion_event: Option<Value>,
    #[serde(default, deserialize_with = "deserialize_asset_values")]
    pub repair_events: Vec<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetRepairsResponse {
    pub data: Vec<AssetRepair>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetRepairMutationResponse {
    pub repair: AssetRepair,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetDisposal {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub key: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub disposal_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub category: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub serial_no: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub disposal_method: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub reason: String,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub original_cost: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub accumulated_depreciation: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub net_book_value: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub starting_auction_price: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub actual_disposal_price: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub disposal_cost: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub net_gain_loss: i64,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub disposal_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub buyer_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub buyer_phone: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub council_leader: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub council_members: String,
    #[serde(deserialize_with = "deserialize_asset_flag")]
    pub security_data_wipe_certified: bool,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub data_wipe_officer: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub notes: String,
    pub created_by_name: Option<String>,
    pub approved_by_name: Option<String>,
    pub disposal_approval_event: Option<Value>,
    #[serde(default, deserialize_with = "deserialize_asset_values")]
    pub disposal_events: Vec<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDisposalsResponse {
    pub data: Vec<AssetDisposal>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDisposalMutationResponse {
    pub disposal: AssetDisposal,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetDisposal {
    pub disposal_code: String,
    pub disposal_method: String,
    pub disposal_date: String,
    pub asset_code: String,
    pub asset_name: String,
    pub category: String,
    pub serial_no: String,
    pub reason: String,
    pub original_cost: i64,
    pub accumulated_depreciation: i64,
    pub starting_auction_price: i64,
    pub actual_disposal_price: i64,
    pub disposal_cost: i64,
    pub buyer_name: String,
    pub buyer_phone: String,
    pub council_leader: String,
    pub council_members: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApproveAssetDisposal {
    pub actual_disposal_price: i64,
    pub security_data_wipe_certified: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetDepreciationScheduleRow {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub period: String,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub month_number: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub monthly_amount: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub accumulated_amount: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub remaining_amount: i64,
    #[serde(deserialize_with = "deserialize_asset_flag")]
    pub posted: bool,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetDepreciation {
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub key: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_code: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_name: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub category: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub department: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub cost_account: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub asset_account: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub depreciation_method: String,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub original_cost: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub residual_value: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub life_months: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub depreciated_months: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub monthly_deprec: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub yearly_deprec: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub accumulated_deprec: i64,
    #[serde(deserialize_with = "deserialize_legacy_asset_money")]
    pub net_book_value: i64,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub start_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub end_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub last_run_date: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_asset_text")]
    pub notes: String,
    #[serde(default, deserialize_with = "deserialize_asset_records")]
    pub schedule_list: Vec<AssetDepreciationScheduleRow>,
    #[serde(default, deserialize_with = "deserialize_asset_values")]
    pub depreciation_events: Vec<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDepreciationsResponse {
    pub data: Vec<AssetDepreciation>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDepreciationMutationResponse {
    pub depreciation: AssetDepreciation,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetDepreciation {
    pub asset_code: String,
    pub asset_name: String,
    pub category: String,
    pub department: String,
    pub cost_account: String,
    pub asset_account: String,
    pub depreciation_method: String,
    pub original_cost: i64,
    pub residual_value: i64,
    pub life_months: u32,
    pub start_date: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAssetDepreciation {
    pub period: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetDepreciationRunResponse {
    pub run: AssetDepreciationRun,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDepreciationRun {
    pub run_id: String,
    pub period: String,
    pub posted_at: String,
    pub actor_user_id: String,
    pub actor_name: String,
    pub entry_count: usize,
    pub total_amount: i64,
    pub entries: Vec<Value>,
    pub ledger: String,
    pub finance_general_ledger_updated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetRepair {
    pub repair_code: String,
    pub asset_code: String,
    pub asset_name: String,
    pub category: String,
    pub serial_no: String,
    pub requester: String,
    pub department: String,
    pub severity: String,
    pub repair_unit: String,
    pub vendor: String,
    pub vendor_contact: String,
    pub issue_description: String,
    pub root_cause: String,
    pub solution: String,
    pub replaced_parts: String,
    pub estimated_cost: i64,
    pub cost_bearing: String,
    pub start_date: String,
    pub expected_end_date: String,
    pub warranty_after_repair: String,
    pub approver: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompleteAssetRepair {
    pub actual_cost: i64,
    pub notes: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetAuditItemDetail {
    pub asset_key: Option<String>,
    pub code: String,
    pub name: String,
    pub barcode: String,
    pub category: String,
    pub holder: String,
    pub location: String,
    pub book_location: String,
    pub department: String,
    pub audit_status: String,
    pub scan_code: String,
    pub original_price: Option<i64>,
    pub scanned_at: Option<String>,
    pub scanned_by_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AssetAudit {
    pub key: String,
    pub audit_code: String,
    pub audit_name: String,
    pub audit_type: String,
    pub scope: String,
    pub location: String,
    pub department: String,
    pub start_date: String,
    pub end_date: String,
    pub auditor_leader: String,
    pub auditor_members: String,
    pub book_count: i64,
    pub actual_count: i64,
    pub matched_count: i64,
    pub surplus_count: i64,
    pub missing_count: i64,
    pub damaged_count: i64,
    pub discrepancy: i64,
    pub book_value: i64,
    pub actual_value: i64,
    pub diff_value: i64,
    pub unvalued_count: i64,
    pub actual_unvalued_count: i64,
    pub resolution_proposal: String,
    pub status: String,
    pub notes: String,
    pub snapshot_version: Option<i64>,
    pub created_by_name: String,
    pub created_at: Option<String>,
    pub closed_at: Option<String>,
    pub closed_by_name: Option<String>,
    pub resolution_submitted_at: Option<String>,
    pub resolution_submitted_by_name: Option<String>,
    pub items_list: Vec<AssetAuditItemDetail>,
    pub missing_items: Vec<AssetAuditItemDetail>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetAudit {
    pub audit_code: String,
    pub audit_name: String,
    pub audit_type: String,
    pub scope: String,
    pub location: String,
    pub department: String,
    pub start_date: String,
    pub end_date: String,
    pub auditor_leader: String,
    pub auditor_members: String,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordAssetAuditScan {
    pub scan_code: String,
    pub damaged: bool,
    pub observed_location: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitAssetAuditResolution {
    pub proposal: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetAuditsResponse {
    pub data: Vec<AssetAudit>,
    #[serde(default)]
    pub revision: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetAuditResponse {
    pub audit: AssetAudit,
    #[serde(default)]
    pub revision: String,
}

fn asset_items_replace_payload(items: &[AssetItem], expected_revision: &str) -> Value {
    json!({
        "records": items,
        "expectedRevision": expected_revision,
    })
}

fn asset_allocations_replace_payload(
    allocations: &[AssetAllocation],
    expected_revision: &str,
) -> Value {
    json!({
        "records": allocations,
        "expectedRevision": expected_revision,
    })
}

fn attendance_shift_replace_payload(shifts: &[AttendanceShift], expected_revision: &str) -> Value {
    json!({
        "records": shifts,
        "expectedRevision": expected_revision,
    })
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct LeaveRequestRecord {
    pub key: String,
    pub code: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub employee_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub employee_code: Option<String>,
    pub employee_name: String,
    pub department: String,
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub days_count: Option<f64>,
    pub reason: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub handover_person: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_phone: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl LeaveRequestRecord {
    pub fn effective_leave_type(&self) -> &str {
        if self.leave_type.trim().is_empty() {
            self.extra
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
        } else {
            &self.leave_type
        }
    }

    pub fn effective_start_date(&self) -> &str {
        if self.start_date.trim().is_empty() {
            self.extra
                .get("fromDate")
                .and_then(Value::as_str)
                .unwrap_or_default()
        } else {
            &self.start_date
        }
    }

    pub fn effective_end_date(&self) -> &str {
        if self.end_date.trim().is_empty() {
            self.extra
                .get("toDate")
                .and_then(Value::as_str)
                .unwrap_or_default()
        } else {
            &self.end_date
        }
    }

    pub fn effective_days_count(&self) -> Option<f64> {
        self.days_count.or_else(|| {
            self.extra.get("days").and_then(|value| {
                value
                    .as_f64()
                    .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
            })
        })
    }

    pub fn identity_key(&self) -> &str {
        if !self.key.trim().is_empty() {
            &self.key
        } else if let Some(id) = self
            .extra
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty())
        {
            id
        } else {
            &self.code
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct LeaveRequestsResponse {
    pub data: Vec<LeaveRequestRecord>,
    #[serde(default)]
    pub revision: String,
}

fn leave_requests_replace_payload(
    requests: &[LeaveRequestRecord],
    expected_revision: &str,
) -> Value {
    json!({
        "records": requests,
        "expectedRevision": expected_revision,
    })
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeLeaveRequest {
    pub id: String,
    pub code: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    pub department: String,
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub days: f64,
    pub reason: String,
    pub handover_person: Option<String>,
    pub contact_phone: Option<String>,
    pub status: String,
    pub reviewer_id: Option<String>,
    pub reviewer_name: String,
    pub review_note: String,
    pub reviewed_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeLeaveRequestsResponse {
    pub data: Vec<EmployeeLeaveRequest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeLeaveRequestResponse {
    pub request: EmployeeLeaveRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmployeeLeaveRequest {
    pub leave_type: String,
    pub start_date: String,
    pub end_date: String,
    pub days: f64,
    pub reason: String,
    pub handover_person: Option<String>,
    pub contact_phone: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeLeaveRequestEvent {
    pub sequence_no: i64,
    pub event_type: String,
    pub actor_id: String,
    pub actor_name: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeLeaveRequestEventsResponse {
    pub data: Vec<EmployeeLeaveRequestEvent>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeOvertimeRequest {
    pub id: String,
    pub code: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    pub department: String,
    pub ot_date: String,
    pub requested_hours: f64,
    pub day_type: String,
    pub project: String,
    pub reason: String,
    pub status: String,
    pub reviewer_id: Option<String>,
    pub reviewer_name: String,
    pub review_note: String,
    pub reviewed_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeOvertimeRequestsResponse {
    pub data: Vec<EmployeeOvertimeRequest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeOvertimeRequestResponse {
    pub request: EmployeeOvertimeRequest,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmployeeOvertimeRequest {
    pub ot_date: String,
    pub requested_hours: f64,
    pub day_type: String,
    pub project: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeOvertimeRequestEvent {
    pub sequence_no: i64,
    pub event_type: String,
    pub actor_id: String,
    pub actor_name: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeOvertimeRequestEventsResponse {
    pub data: Vec<EmployeeOvertimeRequestEvent>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceShiftAssignment {
    pub id: String,
    pub code: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    pub department: String,
    pub position: String,
    pub shift_key: String,
    pub shift_code: String,
    pub shift_name: String,
    pub time_range: String,
    pub working_hours: f64,
    pub work_units: f64,
    pub effective_from: String,
    pub effective_to: String,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttendanceShiftAssignmentsResponse {
    pub data: Vec<AttendanceShiftAssignment>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttendanceShiftAssignmentResponse {
    pub assignment: AttendanceShiftAssignment,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAttendanceShiftAssignment {
    pub code: String,
    pub employee_id: String,
    pub shift_key: String,
    pub effective_from: String,
    pub effective_to: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceShiftAssignmentEvent {
    pub sequence_no: i64,
    pub event_type: String,
    pub actor_id: String,
    pub actor_name: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttendanceShiftAssignmentEventsResponse {
    pub data: Vec<AttendanceShiftAssignmentEvent>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionMutationResponse {
    pub revoked: bool,
}

#[derive(Debug, Deserialize)]
struct ChangePasswordResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivationAuthorization {
    pub activation_token: String,
    pub expires_at: String,
    pub user: User,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(rename = "mime", default)]
    pub mime_type: Option<String>,
    pub size_bytes: i64,
    pub modified: String,
    #[serde(default)]
    pub is_protected: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListContext {
    pub parent_id: String,
    pub root_label: String,
}

#[derive(Debug, Deserialize)]
pub struct FileListResponse {
    pub data: Vec<FileNode>,
    pub context: FileListContext,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileShare {
    pub id: String,
    pub file_id: String,
    pub token: String,
    pub is_active: bool,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub file: Option<FileNode>,
}

#[derive(Debug, Deserialize)]
struct CreateFolderResponse {
    file: FileNode,
}

#[derive(Debug, Deserialize)]
struct UploadFileResponse {
    file: FileNode,
}

#[derive(Debug, Deserialize)]
struct RenameFileResponse {
    file: FileNode,
}

#[derive(Debug, Deserialize)]
struct DeleteFileResponse {
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct FileShareLookupResponse {
    share: Option<FileShare>,
}

#[derive(Debug, Deserialize)]
struct FileShareMutationResponse {
    share: FileShare,
}

#[derive(Debug, Deserialize)]
struct PublicFileShareResponse {
    share: FileShare,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersPage {
    pub data: Vec<AdminUser>,
    pub pagination: UsersPagination,
    pub summary: Option<UsersSummary>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CrmContact {
    pub key: String,
    pub code: String,
    pub name: String,
    #[serde(rename = "type")]
    pub contact_type: String,
    pub tax_code: String,
    pub industry: String,
    pub contact_person: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub bank_account: String,
    pub credit_limit: i64,
    pub total_value: i64,
    pub debt_balance: i64,
    pub tier: String,
    pub account_manager: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub legacy_import_status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmContactsResponse {
    pub data: Vec<CrmContact>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrmContactInput {
    pub name: String,
    #[serde(rename = "type")]
    pub contact_type: String,
    pub tax_code: String,
    pub industry: String,
    pub contact_person: String,
    pub phone: String,
    pub email: String,
    pub address: String,
    pub bank_account: String,
    pub credit_limit: i64,
    pub total_value: i64,
    pub debt_balance: i64,
    pub tier: String,
    pub account_manager: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmContactResponse {
    pub contact: CrmContact,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CrmSupplierEvaluation {
    pub key: String,
    pub eval_code: String,
    pub supplier_name: String,
    pub category: String,
    pub quality_score: i64,
    pub delivery_score: i64,
    pub price_score: i64,
    pub service_score: i64,
    pub total_score: i64,
    pub tier: String,
    pub eval_period: String,
    pub evaluator: String,
    pub strengths: String,
    pub weaknesses: String,
    pub decision: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmSupplierEvaluationsResponse {
    pub data: Vec<CrmSupplierEvaluation>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmSupplierEvaluationResponse {
    pub evaluation: CrmSupplierEvaluation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrmSupplierEvaluationInput {
    pub eval_code: String,
    pub eval_period: String,
    pub supplier_name: String,
    pub category: String,
    pub quality_score: i64,
    pub delivery_score: i64,
    pub price_score: i64,
    pub service_score: i64,
    pub evaluator: String,
    pub strengths: String,
    pub weaknesses: String,
    pub decision: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CrmCustomerFeedback {
    pub key: String,
    pub feedback_code: String,
    pub client_name: String,
    pub contact_person: String,
    pub phone: String,
    pub service_name: String,
    pub rating: i64,
    pub content: String,
    pub priority: String,
    pub resolution_action: String,
    pub assigned_staff: String,
    pub received_date: String,
    pub resolved_date: Option<String>,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmCustomerFeedbackListResponse {
    pub data: Vec<CrmCustomerFeedback>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CrmCustomerFeedbackResponse {
    pub feedback: CrmCustomerFeedback,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrmCustomerFeedbackInput {
    pub feedback_code: String,
    pub client_name: String,
    pub contact_person: String,
    pub phone: String,
    pub service_name: String,
    pub rating: i64,
    pub content: String,
    pub priority: String,
    pub resolution_action: String,
    pub assigned_staff: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrTrainingCourse {
    pub key: String,
    pub course_code: String,
    pub course_name: String,
    pub category: String,
    pub instructor: String,
    pub start_date: String,
    pub end_date: String,
    pub duration_hours: i64,
    pub participants_count: i64,
    pub completion_rate: f64,
    pub budget: i64,
    pub location: String,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrTrainingCoursesResponse {
    pub data: Vec<HrTrainingCourse>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrTrainingCourseResponse {
    pub course: HrTrainingCourse,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrTrainingCourseInput {
    pub course_code: String,
    pub course_name: String,
    pub category: String,
    pub instructor: String,
    pub start_date: String,
    pub end_date: String,
    pub duration_hours: i64,
    pub participants_count: i64,
    pub budget: i64,
    pub location: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrCertificate {
    pub key: String,
    pub cert_code: String,
    pub cert_name: String,
    pub employee_id: String,
    pub employee_name: String,
    pub emp_code: String,
    pub department: String,
    pub issuing_org: String,
    pub issue_date: String,
    pub expire_date: String,
    pub credential_id: String,
    pub verification_url: String,
    pub company_sponsored: bool,
    pub exam_fee: i64,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrCertificatesResponse {
    pub data: Vec<HrCertificate>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractSummary {
    pub key: String,
    pub id: String,
    pub code: String,
    pub name: String,
    pub contract_category: String,
    pub contract_template: String,
    pub party_b_type: String,
    pub party_b_name: String,
    pub employee_code: String,
    pub employee_name: String,
    #[serde(rename = "type")]
    pub contract_type: String,
    pub position: String,
    pub department: String,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub employee_sign_status: String,
    pub employee_sign_date: Option<String>,
    pub company_sign_status: String,
    pub company_sign_date: Option<String>,
    pub signature_verification_status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub is_full: Option<bool>,
    #[serde(default)]
    pub party_b_tax_code: Option<String>,
    #[serde(default)]
    pub party_b_representative: Option<String>,
    #[serde(default)]
    pub party_b_position: Option<String>,
    #[serde(default)]
    pub party_b_id_number: Option<String>,
    #[serde(default)]
    pub party_b_phone: Option<String>,
    #[serde(default)]
    pub party_b_email: Option<String>,
    #[serde(default)]
    pub party_b_bank: Option<String>,
    #[serde(default)]
    pub party_b_address: Option<String>,
    #[serde(default)]
    pub employee_id_number: Option<String>,
    #[serde(default)]
    pub employee_phone: Option<String>,
    #[serde(default)]
    pub employee_email: Option<String>,
    #[serde(default)]
    pub employee_bank: Option<String>,
    #[serde(default)]
    pub job_level: Option<String>,
    #[serde(default)]
    pub work_location: Option<String>,
    #[serde(default)]
    pub probation_months: Option<i64>,
    #[serde(default)]
    pub contract_value: Option<i64>,
    #[serde(default)]
    pub salary: Option<i64>,
    #[serde(default)]
    pub allowance: Option<i64>,
    #[serde(default)]
    pub stock_shares_percent: Option<String>,
    #[serde(default)]
    pub payment_method: Option<String>,
    #[serde(default)]
    pub payment_day: Option<i64>,
    #[serde(default)]
    pub working_hours: Option<String>,
    #[serde(default)]
    pub annual_leave_days: Option<i64>,
    #[serde(default)]
    pub insurance_type: Option<String>,
    #[serde(default)]
    pub nda_clause: Option<bool>,
    #[serde(default)]
    pub non_compete_clause: Option<bool>,
    #[serde(default)]
    pub signer_name: Option<String>,
    #[serde(default)]
    pub signer_position: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub custom_field_values: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContractsResponse {
    pub data: Vec<ContractSummary>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ContractResponse {
    pub contract: ContractSummary,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrCertificateResponse {
    pub certificate: HrCertificate,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrCertificateInput {
    pub cert_code: String,
    pub cert_name: String,
    pub employee_code: String,
    pub issuing_org: String,
    pub issue_date: String,
    pub expire_date: String,
    pub credential_id: String,
    pub verification_url: String,
    pub company_sponsored: bool,
    pub exam_fee: i64,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrUniform {
    pub key: String,
    pub code: String,
    pub employee_id: String,
    pub employee_name: String,
    pub emp_code: String,
    pub department: String,
    pub item_type: String,
    pub size: String,
    pub quantity: i64,
    pub request_date: String,
    pub delivery_date: String,
    pub note: String,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrUniformsResponse {
    pub data: Vec<HrUniform>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrUniformResponse {
    pub uniform: HrUniform,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrUniformInput {
    pub employee_code: String,
    pub item_type: String,
    pub size: String,
    pub quantity: i64,
    pub note: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrOnboardingRecord {
    pub key: String,
    pub employee_id: String,
    pub employee_name: String,
    pub emp_code: String,
    pub position: String,
    pub department: String,
    pub start_date: String,
    pub evaluation_date: String,
    pub mentor_id: String,
    pub mentor: String,
    pub mentor_phone: String,
    pub progress: Option<i64>,
    pub current_step: String,
    pub laptop_provided: Option<bool>,
    pub email_created: Option<bool>,
    pub contract_signed: Option<bool>,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrOnboardingResponse {
    pub record: HrOnboardingRecord,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrOnboardingListResponse {
    pub data: Vec<HrOnboardingRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrOnboardingInput {
    pub employee_code: String,
    pub mentor_code: String,
    pub start_date: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrJobOpening {
    pub key: String,
    pub job_code: String,
    pub title: String,
    pub department: String,
    pub level: String,
    pub headcount_needed: i64,
    pub salary_range: String,
    pub deadline: String,
    pub recruiter: String,
    pub experience_req: String,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrJobOpeningResponse {
    pub opening: HrJobOpening,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrJobOpeningsResponse {
    pub data: Vec<HrJobOpening>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrJobOpeningInput {
    pub job_code: String,
    pub title: String,
    pub department: String,
    pub level: String,
    pub headcount_needed: i64,
    pub salary_range: String,
    pub deadline: String,
    pub recruiter: String,
    pub experience_req: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrHeadcountQuota {
    pub key: String,
    pub department: String,
    pub position: String,
    pub position_code: String,
    pub quota: i64,
    pub actual: i64,
    pub vacancies: i64,
    pub salary_budget: i64,
    pub level_distribution: String,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrHeadcountQuotaResponse {
    pub quota: HrHeadcountQuota,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrHeadcountQuotasResponse {
    pub data: Vec<HrHeadcountQuota>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrHeadcountQuotaInput {
    pub department: String,
    pub position: String,
    pub position_code: String,
    pub quota: i64,
    pub salary_budget: i64,
    pub level_distribution: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrReward {
    pub key: String,
    pub reward_code: String,
    pub recipient_type: String,
    pub employee_id: String,
    pub employee_name: String,
    pub emp_code: String,
    pub department: String,
    pub title: String,
    pub reward_type: String,
    pub reward_value: i64,
    pub decision_no: String,
    pub date: String,
    pub achievement_summary: String,
    pub signer_id: String,
    pub signer_name: String,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
    pub approval_recorded_by: String,
    pub approval_recorded_at: String,
    pub award_recorded_by: String,
    pub award_recorded_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrRewardResponse {
    pub reward: HrReward,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrRewardsResponse {
    pub data: Vec<HrReward>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrRewardInput {
    pub reward_code: String,
    pub decision_no: String,
    pub date: String,
    pub recipient_type: String,
    pub employee_code: String,
    pub team_name: String,
    pub department: String,
    pub title: String,
    pub reward_type: String,
    pub reward_value: i64,
    pub achievement_summary: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct HrPerformanceReview {
    pub key: String,
    pub code: String,
    pub employee_id: String,
    pub employee_name: String,
    pub emp_code: String,
    pub department: String,
    pub position: String,
    pub period: String,
    pub self_score: i64,
    pub manager_score: i64,
    pub grade: String,
    pub kpi_bonus: i64,
    pub evaluator_id: String,
    pub evaluator: String,
    pub manager_comment: String,
    pub status: String,
    pub created_by: String,
    pub created_at: String,
    pub approval_recorded_by: String,
    pub approval_recorded_at: String,
    pub workflow_verified: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrPerformanceReviewResponse {
    pub review: HrPerformanceReview,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrPerformanceReviewsResponse {
    pub data: Vec<HrPerformanceReview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrPerformanceReviewInput {
    pub code: String,
    pub employee_code: String,
    pub period: String,
    pub self_score: i64,
    pub manager_score: i64,
    pub kpi_bonus: i64,
    pub manager_comment: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HrEmployeeHistoryRecord {
    pub key: String,
    pub code: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    #[serde(rename = "type")]
    pub history_type: String,
    pub event_date: String,
    pub old_value: String,
    pub new_value: String,
    pub decision_number: String,
    pub declared_signer: String,
    pub note: String,
    pub recorded_by: String,
    pub recorded_by_name: String,
    pub recorded_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrEmployeeHistoryResponse {
    pub record: HrEmployeeHistoryRecord,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HrEmployeeHistoryRecordsResponse {
    pub data: Vec<HrEmployeeHistoryRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrEmployeeHistoryInput {
    pub employee_code: String,
    #[serde(rename = "type")]
    pub history_type: String,
    pub event_date: String,
    pub old_value: String,
    pub new_value: String,
    pub decision_number: String,
    pub declared_signer: String,
    pub note: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeBankAccount {
    pub id: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub status: String,
    pub is_primary: bool,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
    pub approved_by: String,
    pub approved_at: String,
    pub rejection_reason: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeBankAccountsResponse {
    pub data: Vec<EmployeeBankAccount>,
    #[serde(default)]
    pub employee_code: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeBankAccountResponse {
    pub account: EmployeeBankAccount,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmployeeBankAccountInput {
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub is_primary: bool,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHrBankAccountInput {
    pub employee_code: String,
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub is_primary: bool,
    pub note: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize)]
pub struct UsersSummary {
    pub total: usize,
    pub active: usize,
    pub admins: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersPagination {
    pub page: usize,
    pub limit: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_users: usize,
    pub active_users: usize,
    pub total_employees: usize,
    pub new_employees_this_month: usize,
    pub monthly_revenue: i64,
    pub monthly_expense: i64,
    pub pending_approvals_count: usize,
    #[serde(default)]
    pub pending_workflows: Vec<DashboardPendingWorkflow>,
    #[serde(default)]
    pub financial_metrics_available: bool,
    #[serde(default)]
    pub audit_logs_available: bool,
    #[serde(default)]
    pub recent_audit_logs: Vec<AuditLogEntry>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct DashboardPendingWorkflow {
    pub key: String,
    pub id: String,
    pub code: String,
    pub title: String,
    pub requester: String,
    pub department: String,
    pub submitted_date: String,
    pub status: String,
    #[serde(rename = "type")]
    pub workflow_type: String,
    pub amount: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub key: String,
    pub id: String,
    pub timestamp: String,
    pub user: String,
    pub action: String,
    pub module: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogsPagination {
    pub page: usize,
    pub limit: usize,
    pub total: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AuditLogsResponse {
    pub data: Vec<AuditLogEntry>,
    pub pagination: AuditLogsPagination,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AuditEventRecordedResponse {
    pub recorded: bool,
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeListResponse {
    pub data: Vec<Employee>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeResponse {
    pub employee: Employee,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeePayslip {
    pub id: String,
    pub month: Option<String>,
    pub basic_salary: Option<u64>,
    pub allowance: Option<u64>,
    pub bonus_kpi: Option<u64>,
    pub insurance_deduction: Option<u64>,
    pub personal_tax: Option<u64>,
    pub net_salary: Option<u64>,
    pub source_status: Option<String>,
    pub data_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeePayslipsPagination {
    pub page: usize,
    pub limit: usize,
    pub total: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct EmployeePayslipsResponse {
    pub data: Vec<EmployeePayslip>,
    pub pagination: EmployeePayslipsPagination,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmailDelivery {
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeCreateResponse {
    pub employee: Employee,
    pub delivery: EmailDelivery,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeActivationResponse {
    pub delivery: EmailDelivery,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrgUnitsResponse {
    pub data: Vec<OrgUnit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserNotification {
    pub id: String,
    pub key: String,
    pub user_id: String,
    pub title: String,
    pub message: String,
    #[serde(rename = "type")]
    pub notification_type: String,
    #[serde(default)]
    pub link: String,
    pub read: bool,
    pub unread: bool,
    pub time: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UserNotificationsResponse {
    pub data: Vec<UserNotification>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemBroadcast {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(rename = "type")]
    pub broadcast_type: String,
    pub target_audience: String,
    pub sender: String,
    pub created_at: String,
    #[serde(default)]
    pub scheduled_at: Option<String>,
    #[serde(default)]
    pub channels: Vec<String>,
    #[serde(default)]
    pub read_count: u64,
    #[serde(default)]
    pub total_recipients: u64,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemBroadcastInput {
    pub title: String,
    pub content: String,
    #[serde(rename = "type")]
    pub broadcast_type: String,
    pub target_audience: String,
    pub channels: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemBroadcastsResponse {
    pub data: Vec<SystemBroadcast>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationEmailTemplate {
    pub subject: String,
    pub heading: String,
    pub body: String,
    pub button_label: String,
    pub footer: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationEmailTemplateResponse {
    pub template: ActivationEmailTemplate,
    #[serde(default)]
    pub email_configured: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRoom {
    pub key: String,
    pub name: String,
    pub location: String,
    pub capacity: u32,
    #[serde(default)]
    pub equipment: Vec<String>,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingBooking {
    pub key: String,
    pub room_name: String,
    pub meeting_title: String,
    pub booker: String,
    pub date: String,
    pub time_slot: String,
    pub participants_count: u32,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MeetingRoomsResponse {
    pub rooms: Vec<MeetingRoom>,
    pub bookings: Vec<MeetingBooking>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRoomInput {
    pub name: String,
    pub location: String,
    pub capacity: u32,
    pub equipment: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingBookingInput {
    pub room_name: String,
    pub meeting_title: String,
    pub booker: String,
    pub date: String,
    pub time_slot: String,
    pub participants_count: u32,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalStepDefinition {
    pub level: u32,
    pub role_name: String,
    pub default_approver: String,
    pub sla_hours: u32,
    pub can_reject: bool,
    #[serde(rename = "requireTokenPKI")]
    pub require_token_pki: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowFieldDefinition {
    pub field_name: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowBlueprint {
    pub key: String,
    pub workflow_code: String,
    pub workflow_name: String,
    pub category: String,
    pub description: String,
    pub scope: String,
    pub total_steps: u32,
    pub sla_target_hours: u32,
    pub applicable_budget_limit: u64,
    pub approval_flow: Vec<ApprovalStepDefinition>,
    pub form_fields: Vec<WorkflowFieldDefinition>,
    #[serde(default)]
    pub active_instances_count: u64,
    #[serde(default)]
    pub total_completed_count: u64,
    #[serde(default)]
    pub pass_rate: f64,
    pub status: String,
    pub version: String,
    pub created_by: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowBlueprintsResponse {
    pub data: Vec<WorkflowBlueprint>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowBlueprintInput {
    pub workflow_code: String,
    pub workflow_name: String,
    pub category: String,
    pub description: String,
    pub scope: String,
    pub total_steps: u32,
    pub sla_target_hours: u32,
    pub applicable_budget_limit: u64,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRequest {
    pub key: String,
    pub code: String,
    pub workflow_name: String,
    pub workflow_code: String,
    pub category: String,
    pub requester: String,
    pub department: String,
    pub current_level: u32,
    pub total_levels: u32,
    pub role_requirement: String,
    pub budget_amount: u64,
    pub submitted_at: String,
    pub sla_deadline: String,
    pub sla_hours_left: f64,
    pub priority: String,
    pub status: String,
    pub summary_details: String,
    pub token_required: bool,
    #[serde(default)]
    pub attachments: Vec<Value>,
    pub approval_notes: Option<String>,
    pub created_by_user_id: String,
    pub created_by_name: String,
    #[serde(default)]
    pub approval_history: Vec<Value>,
    #[serde(default)]
    pub pki_integration_available: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowRequestsResponse {
    pub data: Vec<WorkflowRequest>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowCollectionResponse {
    pub data: Vec<Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct WorkflowBudgetTier {
    pub key: String,
    pub tier_name: String,
    pub min_amount: u64,
    pub max_amount: u64,
    pub required_levels: String,
    pub sla_hours: u32,
    pub auto_escalate_hours: u32,
    #[serde(rename = "requirePKI")]
    pub require_pki: bool,
    pub status: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkflowSettingsResponse {
    pub data: Vec<WorkflowBudgetTier>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRequestInput {
    pub code: String,
    pub workflow_code: String,
    pub workflow_name: String,
    pub requester: String,
    pub department: String,
    pub summary_details: String,
    pub budget_amount: u64,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRequestDecisionInput {
    pub action: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeProposal {
    pub key: String,
    pub code: String,
    pub title: String,
    #[serde(rename = "type")]
    pub proposal_type: String,
    pub amount: i64,
    pub content: String,
    pub submitter_id: String,
    pub employee_name: String,
    pub employee_code: String,
    pub status: String,
    pub approver: String,
    pub review_note: String,
    pub reviewed_at: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeProposalsResponse {
    pub data: Vec<EmployeeProposal>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeProposalResponse {
    pub proposal: EmployeeProposal,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeProposalInput {
    pub title: String,
    #[serde(rename = "type")]
    pub proposal_type: String,
    pub amount: i64,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeProposalReviewInput {
    pub status: String,
    pub review_note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskChecklistItem {
    pub key: String,
    pub title: String,
    pub completed: bool,
    pub sort_order: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskComment {
    pub key: String,
    pub content: String,
    pub author: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskActivity {
    pub key: String,
    pub content: String,
    pub actor: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskReportAttachment {
    pub id: String,
    pub key: String,
    pub name: String,
    pub size: i64,
    #[serde(rename = "type")]
    pub attachment_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskReport {
    pub key: String,
    pub content: String,
    pub author: String,
    pub progress: i64,
    pub status: String,
    pub attachments: Vec<TaskReportAttachment>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnterpriseTask {
    pub key: String,
    pub task_code: String,
    pub task_title: String,
    pub description: String,
    pub project_name: String,
    pub assignee_id: String,
    pub assignee: String,
    pub created_by: String,
    pub priority: String,
    pub due_date: String,
    pub progress: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub subtasks: Option<Vec<TaskChecklistItem>>,
    #[serde(default)]
    pub comments: Option<Vec<TaskComment>>,
    #[serde(default)]
    pub activities: Option<Vec<TaskActivity>>,
    #[serde(default)]
    pub reports: Option<Vec<TaskReport>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskAssignee {
    pub id: String,
    pub name: String,
    pub employee_code: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub position: String,
    pub role: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProjectAssignees {
    pub name: String,
    pub assignee_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpdeskTicket {
    pub key: String,
    pub code: String,
    pub title: String,
    pub requester: String,
    pub department: String,
    pub priority: String,
    pub status: String,
    pub created_date: String,
    pub created_by: String,
    pub created_by_name: String,
    pub updated_at: String,
    #[serde(default)]
    pub legacy_import_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHelpdeskTicketInput {
    pub title: String,
    pub requester: String,
    pub department: String,
    pub priority: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHelpdeskTicketInput {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HelpdeskTicketsResponse {
    pub data: Vec<HelpdeskTicket>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HelpdeskTicketResponse {
    pub ticket: HelpdeskTicket,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpdeskIncident {
    pub key: String,
    pub code: String,
    pub incident_title: String,
    pub affected_system: String,
    pub severity: String,
    pub occurred_at: String,
    pub resolved_at: Option<String>,
    pub handler: String,
    pub root_cause: String,
    pub status: String,
    pub created_by: String,
    pub created_by_name: String,
    pub updated_at: String,
    #[serde(default)]
    pub legacy_import_status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpdeskIncidentEvent {
    pub event_type: String,
    pub actor_id: String,
    pub actor_name: String,
    pub from_status: Option<String>,
    pub to_status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HelpdeskIncidentsResponse {
    pub data: Vec<HelpdeskIncident>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HelpdeskIncidentResponse {
    pub incident: HelpdeskIncident,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpdeskIncidentDetailResponse {
    pub incident: HelpdeskIncident,
    pub events: Vec<HelpdeskIncidentEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHelpdeskIncidentInput {
    pub incident_title: String,
    pub affected_system: String,
    pub severity: String,
    pub handler: String,
    pub root_cause: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveHelpdeskIncidentInput {
    pub resolution_note: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyHelpdeskTicketImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub ticket_records: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyHelpdeskTicketImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyHelpdeskIncidentImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub incident_records: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyHelpdeskIncidentImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetItemsImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetItemsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyReportsCatalogImportPreview {
    pub batch_id: String,
    pub source_mode: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub identical_records: usize,
    pub conflicting_records: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyReportsCatalogImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub identical_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetAllocationsImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub legacy_signature_claims: usize,
    pub legacy_warehouse_receipt_claims: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetAllocationsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetTransfersImportPreview {
    pub batch_id: String,
    pub source_mode: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub legacy_approval_claims: usize,
    pub legacy_receipt_claims: usize,
    pub duplicate_transfer_code_records: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetTransfersImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetDisposalsImportPreview {
    pub batch_id: String,
    pub source_mode: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub legacy_wipe_claims: usize,
    pub duplicate_disposal_code_records: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetDisposalsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetDepreciationsImportPreview {
    pub batch_id: String,
    pub source_mode: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub duplicate_asset_code_records: usize,
    pub legacy_history_claims: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetDepreciationsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetMaintenancesImportPreview {
    pub batch_id: String,
    pub source_mode: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub target_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub duplicate_maintenance_codes: usize,
    pub legacy_completion_claims: usize,
    pub legacy_certificate_claims: usize,
    pub legacy_completed_checklist_records: usize,
    pub batch_already_applied: bool,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAssetMaintenancesImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TasksResponse {
    pub data: Vec<EnterpriseTask>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub id: String,
    pub title: String,
    pub owner_id: String,
    #[serde(default)]
    pub owner_name: String,
    #[serde(default)]
    pub owner_code: String,
    pub current_revision: i64,
    #[serde(default)]
    pub settings: Value,
    pub user_role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentsResponse {
    pub data: Vec<DocumentRecord>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatChannel {
    pub id: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub visibility: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub status: String,
    pub kind: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub topic: String,
    #[serde(default)]
    pub locked: bool,
    #[serde(default)]
    pub membership: Option<Value>,
    #[serde(default)]
    pub unread_count: i64,
    #[serde(default)]
    pub last_message: Option<ChatLastMessage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatLastMessage {
    pub id: String,
    pub user_id: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatChannelsResponse {
    pub data: Vec<ChatChannel>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUserProfile {
    pub full_name: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatEmployeeDepartment {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatEmployeeInfo {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub department: Option<ChatEmployeeDepartment>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessageUser {
    pub id: String,
    pub email: String,
    pub profile: ChatUserProfile,
    pub employee: ChatEmployeeInfo,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatReaction {
    pub id: String,
    pub message_id: String,
    pub user_id: String,
    pub emoji: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub channel_id: String,
    pub user_id: String,
    pub content: String,
    #[serde(default)]
    pub reply_to_id: Option<String>,
    #[serde(default)]
    pub attachments: Vec<Value>,
    #[serde(default)]
    pub edited_at: Option<String>,
    #[serde(default)]
    pub recalled_at: Option<String>,
    #[serde(default)]
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub user: ChatMessageUser,
    #[serde(default)]
    pub reactions: Vec<ChatReaction>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessagePagination {
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessagesResponse {
    pub data: Vec<ChatMessage>,
    pub pagination: ChatMessagePagination,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatMessageMutationResponse {
    pub success: bool,
    pub data: ChatMessage,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDirectoryUser {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(default)]
    pub employee_code: String,
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub position: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatUsersResponse {
    pub data: Vec<ChatDirectoryUser>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatDirectMessageResponse {
    pub success: bool,
    pub data: ChatChannel,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatSuccessResponse {
    pub success: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FinanceCashTransaction {
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
    #[serde(default)]
    pub department: String,
    #[serde(default)]
    pub employee_code: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFinanceCashTransaction {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
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
    pub department: Option<String>,
    pub employee_code: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FinanceCashTransactionsResponse {
    pub data: Vec<FinanceCashTransaction>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FinanceCashMutationResponse {
    pub transaction: FinanceCashTransaction,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FinanceBankAccount {
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

#[derive(Debug, Clone, Deserialize)]
pub struct FinanceBankAccountsResponse {
    pub data: Vec<FinanceBankAccount>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FinanceBankAccountMutationResponse {
    pub account: FinanceBankAccount,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFinanceBankAccount {
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub balance: i64,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceBankTransferMutationResponse {
    pub transfer: FinanceBankTransfer,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinanceBankTransfer {
    pub key: String,
    pub from_account_key: String,
    pub to_account_key: String,
    pub amount: i64,
    pub note: String,
    pub date: String,
    pub debit: FinanceCashTransaction,
    pub credit: FinanceCashTransaction,
    pub replayed: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateFinanceBankTransfer {
    pub idempotency_key: String,
    pub from_account_key: String,
    pub to_account_key: String,
    pub amount: i64,
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentSnapshot {
    pub revision: i64,
    pub data: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentApiResponse {
    pub document: DocumentRecord,
    pub snapshot: Option<DocumentSnapshot>,
    #[serde(default)]
    pub operations: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentHistoryRecord {
    pub id: String,
    pub revision: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentHistoryResponse {
    pub history: Vec<DocumentHistoryRecord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentCreateResponse {
    pub document: DocumentRecord,
    pub snapshot: DocumentSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMutationResponse {
    pub document: DocumentRecord,
    #[serde(default)]
    pub snapshot_saved: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentComment {
    pub id: String,
    pub document_id: String,
    pub author_id: String,
    pub author_name: String,
    #[serde(default)]
    pub author_code: String,
    pub anchor: Value,
    pub body: String,
    pub resolved: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentCommentsResponse {
    pub comments: Vec<DocumentComment>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentCommentMutationResponse {
    pub comment: DocumentComment,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentMember {
    pub id: String,
    pub role: String,
    pub created_at: String,
    pub user_id: String,
    pub name: String,
    pub email: String,
    #[serde(default)]
    pub employee_code: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentMembersResponse {
    pub members: Vec<DocumentMember>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentShareResponse {
    pub success: bool,
    pub member: DocumentShareMember,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentShareMember {
    pub user_id: String,
    pub name: String,
    pub email: String,
    pub role: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DocumentWriteResponse {
    pub success: bool,
    pub revision: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TaskAssigneesResponse {
    pub data: Vec<TaskAssignee>,
    #[serde(default)]
    pub projects: Vec<TaskProjectAssignees>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TaskResponse {
    pub task: EnterpriseTask,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTasksResponse {
    pub tasks: Vec<EnterpriseTask>,
    #[serde(default)]
    pub count: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct DeletedTaskResponse {
    deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub task_title: String,
    pub description: String,
    pub project_name: String,
    pub assignee_id: String,
    pub priority: String,
    pub due_date: String,
    pub checklist: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskBatchInput {
    pub task_title: String,
    pub description: String,
    pub project_name: String,
    pub assignee_ids: Vec<String>,
    pub priority: String,
    pub due_date: String,
    pub checklist: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assignee_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskReportInput {
    pub content: String,
    pub progress: i64,
    pub status: String,
    pub attachments: Vec<TaskReportAttachment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategicPlan {
    pub key: String,
    pub code: String,
    pub name: String,
    pub department: String,
    pub start_date: String,
    pub end_date: String,
    pub budget: i64,
    pub manager: String,
    pub priority: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStrategicPlanInput {
    pub code: String,
    pub name: String,
    pub department: String,
    pub start_date: String,
    pub end_date: String,
    pub budget: i64,
    pub manager: String,
    pub priority: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StrategicPlansResponse {
    pub data: Vec<StrategicPlan>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategicMilestone {
    pub key: String,
    pub code: String,
    pub quarter: String,
    pub name: String,
    pub acceptance_criteria: String,
    pub owner: String,
    pub deadline: String,
    pub progress: u8,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStrategicMilestoneInput {
    pub code: String,
    pub quarter: String,
    pub name: String,
    pub acceptance_criteria: String,
    pub owner: String,
    pub deadline: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StrategicMilestonesResponse {
    pub data: Vec<StrategicMilestone>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanProgressEntry {
    pub key: String,
    pub code: String,
    pub plan_name: String,
    pub task_title: String,
    pub assignee: String,
    pub due_date: String,
    pub days_remaining: i64,
    pub progress_percent: i64,
    pub weight_percent: i64,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlanProgressInput {
    pub progress_percent: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlanProgressResponse {
    pub data: Vec<PlanProgressEntry>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanReportEntry {
    pub key: String,
    pub period: String,
    pub department: String,
    pub leader: String,
    pub total_plans: i64,
    pub completed_plans: i64,
    pub approved_budget: i64,
    pub actual_spent: i64,
    pub variance: i64,
    pub kpi_score: f64,
    pub evaluation: String,
    pub created_by_user_id: String,
    pub created_by_name: String,
    pub created_at: String,
    pub updated_by_user_id: String,
    pub updated_by_name: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanReportWriteInput {
    pub period: String,
    pub department: String,
    pub leader: String,
    pub total_plans: i64,
    pub completed_plans: i64,
    pub approved_budget: i64,
    pub actual_spent: i64,
    pub kpi_score: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlanReportsResponse {
    pub data: Vec<PlanReportEntry>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategicOkr {
    pub key: String,
    pub okr_code: String,
    pub title: String,
    pub pillar: String,
    pub owner: String,
    pub target_metric: String,
    pub progress_pct: f64,
    pub deadline: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStrategicOkrInput {
    pub okr_code: String,
    pub title: String,
    pub pillar: String,
    pub owner: String,
    pub target_metric: String,
    pub progress_pct: f64,
    pub deadline: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StrategicOkrsResponse {
    pub data: Vec<StrategicOkr>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPlanImportScopePreview {
    pub scope: String,
    pub source_records: usize,
    pub target_records: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPlanImportPreview {
    pub batch_id: String,
    pub total_records: usize,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub can_apply: bool,
    pub collections: Vec<LegacyPlanImportScopePreview>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPlanImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub imported_at: String,
    pub collections: Vec<LegacyPlanImportScopePreview>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_accounts: usize,
    pub quarantined_records: usize,
    pub already_imported_records: usize,
    pub generic_collection_records: usize,
    pub local_storage_records: usize,
    pub employee_profile_records: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankImportResult {
    pub batch_id: String,
    pub imported_accounts: usize,
    pub quarantined_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankQuarantineItem {
    pub source_key_sha256: String,
    pub source_kind: String,
    pub batch_id: String,
    pub issue_code: String,
    pub employee_code: String,
    pub bank_name: String,
    pub account_number_masked: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankQuarantineResponse {
    pub data: Vec<LegacyEmployeeBankQuarantineItem>,
    pub pagination: LegacyEmployeeBankQuarantinePagination,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankQuarantinePagination {
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub total_pages: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyEmployeeBankQuarantineReview {
    pub source_key_sha256: String,
    pub action: String,
    pub account_id: Option<String>,
    pub resolved_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCrmOperationsImportPreview {
    pub batch_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub supplier_evaluation_records: usize,
    pub customer_feedback_records: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCrmOperationsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCrmContactsImportPreview {
    pub batch_id: String,
    pub source_database_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub customer_records: usize,
    pub supplier_records: usize,
    pub partner_records: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCrmContactsImportResult {
    pub batch_id: String,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyFinanceImportPreview {
    pub batch_id: String,
    pub source_database_id: String,
    pub payload_sha256: String,
    pub confirmation_phrase: String,
    pub source_records: usize,
    pub importable_records: usize,
    pub already_imported_records: usize,
    pub conflicted_records: usize,
    pub account_records: usize,
    pub cash_transaction_records: usize,
    pub importable_accounts: usize,
    pub already_imported_accounts: usize,
    pub conflicted_accounts: usize,
    pub importable_cash_transactions: usize,
    pub already_imported_cash_transactions: usize,
    pub conflicted_cash_transactions: usize,
    pub can_apply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyFinanceImportResult {
    pub batch_id: String,
    pub source_records: usize,
    pub imported_records: usize,
    pub already_imported_records: usize,
    pub imported_accounts: usize,
    pub imported_cash_transactions: usize,
    pub imported_at: String,
}

#[derive(Debug, Clone, Deserialize)]
struct StrategicPlanResponse {
    plan: StrategicPlan,
}

#[derive(Debug, Clone, Deserialize)]
struct StrategicMilestoneResponse {
    milestone: StrategicMilestone,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanProgressMutationResponse {
    progress: PlanProgressEntry,
}

#[derive(Debug, Clone, Deserialize)]
struct PlanReportMutationResponse {
    report: PlanReportEntry,
}

#[derive(Debug, Clone, Deserialize)]
struct StrategicOkrMutationResponse {
    okr: StrategicOkr,
}

#[derive(Debug, Deserialize)]
struct LegacyPlanImportPreviewResponse {
    preview: LegacyPlanImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyPlanImportResultResponse {
    import: LegacyPlanImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyEmployeeBankImportPreviewResponse {
    preview: LegacyEmployeeBankImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyEmployeeBankImportResultResponse {
    import: LegacyEmployeeBankImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyEmployeeBankQuarantineResponseEnvelope {
    data: Vec<LegacyEmployeeBankQuarantineItem>,
    pagination: LegacyEmployeeBankQuarantinePagination,
}

#[derive(Debug, Deserialize)]
struct LegacyEmployeeBankQuarantineReviewResponse {
    review: LegacyEmployeeBankQuarantineReview,
}

#[derive(Debug, Deserialize)]
struct LegacyCrmOperationsImportPreviewResponse {
    preview: LegacyCrmOperationsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyCrmOperationsImportResultResponse {
    import: LegacyCrmOperationsImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyCrmContactsImportPreviewResponse {
    preview: LegacyCrmContactsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyCrmContactsImportResultResponse {
    import: LegacyCrmContactsImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyFinanceImportPreviewResponse {
    preview: LegacyFinanceImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyFinanceImportResultResponse {
    import: LegacyFinanceImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyHelpdeskTicketImportPreviewResponse {
    preview: LegacyHelpdeskTicketImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyHelpdeskTicketImportResultResponse {
    import: LegacyHelpdeskTicketImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyHelpdeskIncidentImportPreviewResponse {
    preview: LegacyHelpdeskIncidentImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyHelpdeskIncidentImportResultResponse {
    import: LegacyHelpdeskIncidentImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetItemsImportPreviewResponse {
    preview: LegacyAssetItemsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetItemsImportResultResponse {
    import: LegacyAssetItemsImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyReportsCatalogImportPreviewResponse {
    preview: LegacyReportsCatalogImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyReportsCatalogImportResultResponse {
    import: LegacyReportsCatalogImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetAllocationsImportPreviewResponse {
    preview: LegacyAssetAllocationsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetAllocationsImportResultResponse {
    import: LegacyAssetAllocationsImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetTransfersImportPreviewResponse {
    preview: LegacyAssetTransfersImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetTransfersImportResultResponse {
    import: LegacyAssetTransfersImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetDisposalsImportPreviewResponse {
    preview: LegacyAssetDisposalsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetDisposalsImportResultResponse {
    import: LegacyAssetDisposalsImportResult,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetDepreciationsImportPreviewResponse {
    preview: LegacyAssetDepreciationsImportPreview,
}

#[derive(Debug, Deserialize)]
struct LegacyAssetDepreciationsImportResultResponse {
    import: LegacyAssetDepreciationsImportResult,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyAssetMaintenancesImportPreviewResponse {
    preview: LegacyAssetMaintenancesImportPreview,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyAssetMaintenancesImportResultResponse {
    import: LegacyAssetMaintenancesImportResult,
}

#[derive(Debug, Clone, Deserialize)]
struct TaskAttachmentResponse {
    attachment: TaskReportAttachment,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SystemBroadcastMutation {
    Saved(SystemBroadcast),
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotificationMutation {
    Updated(UserNotification),
    Replaced(Vec<UserNotification>),
    Deleted,
}

#[derive(Debug, Deserialize)]
struct DeletedCollectionRecord {
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct AdminUserResponse {
    user: AdminUser,
}

#[derive(Debug, Deserialize)]
struct UserNotificationResponse {
    notification: UserNotification,
}

#[derive(Debug, Deserialize)]
struct DeletedNotificationResponse {
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct SystemBroadcastResponse {
    record: SystemBroadcast,
}

#[derive(Debug, Deserialize)]
struct ActivationEmailTemplateMutationResponse {
    template: ActivationEmailTemplate,
}

#[derive(Debug, Deserialize)]
struct MeetingRoomMutationResponse {
    room: MeetingRoom,
}

#[derive(Debug, Deserialize)]
struct MeetingBookingMutationResponse {
    booking: MeetingBooking,
}

#[derive(Debug, Deserialize)]
struct WorkflowBlueprintMutationResponse {
    blueprint: WorkflowBlueprint,
}

#[derive(Debug, Deserialize)]
struct WorkflowRequestMutationResponse {
    request: WorkflowRequest,
}

impl ApiClient {
    fn authenticated_request_task<T: DeserializeOwned + Send + 'static>(
        &self,
        session: &Session,
        mut request: Request,
    ) -> ApiTask<T> {
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<T>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_documents_task(&self, session: &Session) -> ApiTask<DocumentsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/documents",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn get_document_task(
        &self,
        session: &Session,
        document_id: &str,
    ) -> ApiTask<DocumentApiResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/documents/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(document_id)
            )),
        )
    }

    pub fn list_document_history_task(
        &self,
        session: &Session,
        document_id: &str,
    ) -> ApiTask<DocumentHistoryResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/documents/{}/history",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(document_id)
            )),
        )
    }

    pub fn create_document_task(
        &self,
        session: &Session,
        title: &str,
    ) -> ApiTask<DocumentCreateResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!("{}/documents", session.endpoint.trim_end_matches('/')),
                Some(json!({ "title": title })),
            ),
        )
    }

    pub fn save_document_task(
        &self,
        session: &Session,
        document_id: &str,
        title: &str,
        expected_revision: i64,
        snapshot: Value,
    ) -> ApiTask<DocumentMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "PATCH",
                format!(
                    "{}/documents/{}",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(document_id)
                ),
                Some(document_save_payload(title, expected_revision, snapshot)),
            ),
        )
    }

    pub fn list_document_comments_task(
        &self,
        session: &Session,
        document_id: &str,
    ) -> ApiTask<DocumentCommentsResponse> {
        let document_id = encode_path_segment(document_id);
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/documents/{document_id}/comments",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_document_comment_task(
        &self,
        session: &Session,
        document_id: &str,
        body: &str,
    ) -> ApiTask<DocumentCommentMutationResponse> {
        let document_id = encode_path_segment(document_id);
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/documents/{document_id}/comments",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(json!({ "body": body })),
            ),
        )
    }

    pub fn update_document_comment_task(
        &self,
        session: &Session,
        document_id: &str,
        comment_id: &str,
        resolved: bool,
    ) -> ApiTask<DocumentCommentMutationResponse> {
        let document_id = encode_path_segment(document_id);
        let comment_id = encode_path_segment(comment_id);
        self.authenticated_request_task(
            session,
            json_request(
                "PATCH",
                format!(
                    "{}/documents/{document_id}/comments/{comment_id}",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(json!({ "resolved": resolved })),
            ),
        )
    }

    pub fn share_document_task(
        &self,
        session: &Session,
        document_id: &str,
        email: &str,
        role: &str,
    ) -> ApiTask<DocumentShareResponse> {
        let document_id = encode_path_segment(document_id);
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/documents/{document_id}/share",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(json!({ "email": email, "role": role })),
            ),
        )
    }

    pub fn list_document_members_task(
        &self,
        session: &Session,
        document_id: &str,
    ) -> ApiTask<DocumentMembersResponse> {
        let document_id = encode_path_segment(document_id);
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/documents/{document_id}/members",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn list_chat_channels_task(&self, session: &Session) -> ApiTask<ChatChannelsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/chat/channels",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn list_chat_users_task(
        &self,
        session: &Session,
        search: &str,
    ) -> ApiTask<ChatUsersResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/chat/users?search={}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(search.trim())
            )),
        )
    }

    pub fn create_chat_dm_task(
        &self,
        session: &Session,
        user_ids: &[String],
    ) -> ApiTask<ChatDirectMessageResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!("{}/chat/dms", session.endpoint.trim_end_matches('/')),
                Some(json!({ "userIds": user_ids })),
            ),
        )
    }

    pub fn list_chat_messages_task(
        &self,
        session: &Session,
        channel_id: &str,
        before: Option<&str>,
        limit: usize,
    ) -> ApiTask<ChatMessagesResponse> {
        let mut url = format!(
            "{}/chat/channels/{}/messages?limit={}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(channel_id),
            limit.clamp(1, 100)
        );
        if let Some(before) = before {
            url.push_str("&before=");
            url.push_str(&encode_path_segment(before));
        }
        self.authenticated_request_task(session, Request::get(url))
    }

    pub fn send_chat_message_task(
        &self,
        session: &Session,
        channel_id: &str,
        content: &str,
        reply_to_id: Option<&str>,
    ) -> ApiTask<ChatMessageMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/chat/channels/{}/messages",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(channel_id)
                ),
                Some(json!({ "content": content, "replyToId": reply_to_id })),
            ),
        )
    }

    pub fn toggle_chat_reaction_task(
        &self,
        session: &Session,
        message_id: &str,
        emoji: &str,
    ) -> ApiTask<ChatMessageMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/chat/messages/{}/reactions",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(message_id)
                ),
                Some(json!({ "emoji": emoji })),
            ),
        )
    }

    pub fn mark_chat_read_task(
        &self,
        session: &Session,
        channel_id: &str,
    ) -> ApiTask<ChatSuccessResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/chat/channels/{}/read",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(channel_id)
                ),
                Some(json!({})),
            ),
        )
    }

    pub fn list_finance_cash_transactions_task(
        &self,
        session: &Session,
        source: Option<&str>,
    ) -> ApiTask<FinanceCashTransactionsResponse> {
        let mut url = format!(
            "{}/finance/cash-transactions",
            session.endpoint.trim_end_matches('/')
        );
        if let Some(source) = source {
            url.push_str("?source=");
            url.push_str(&encode_path_segment(source));
        }
        self.authenticated_request_task(session, Request::get(url))
    }

    pub fn create_finance_cash_transaction_task(
        &self,
        session: &Session,
        transaction: &CreateFinanceCashTransaction,
    ) -> ApiTask<FinanceCashMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/finance/cash-transactions",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(serde_json::to_value(transaction).unwrap_or(Value::Null)),
            ),
        )
    }

    pub fn cancel_finance_cash_transaction_task(
        &self,
        session: &Session,
        transaction_id: &str,
    ) -> ApiTask<FinanceCashMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "PATCH",
                format!(
                    "{}/finance/cash-transactions/{}",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(transaction_id)
                ),
                Some(json!({ "status": "Đã hủy" })),
            ),
        )
    }

    pub fn list_finance_bank_accounts_task(
        &self,
        session: &Session,
    ) -> ApiTask<FinanceBankAccountsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/finance/bank-accounts",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_finance_bank_account_task(
        &self,
        session: &Session,
        account: &CreateFinanceBankAccount,
    ) -> ApiTask<FinanceBankAccountMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/finance/bank-accounts",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(serde_json::to_value(account).unwrap_or(Value::Null)),
            ),
        )
    }

    pub fn create_finance_bank_transfer_task(
        &self,
        session: &Session,
        transfer: &CreateFinanceBankTransfer,
    ) -> ApiTask<FinanceBankTransferMutationResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!(
                    "{}/finance/bank-transfers",
                    session.endpoint.trim_end_matches('/')
                ),
                Some(serde_json::to_value(transfer).unwrap_or(Value::Null)),
            ),
        )
    }

    pub fn list_admin_audit_logs_task(
        &self,
        session: &Session,
        page: usize,
        limit: usize,
        filter: &str,
        search: &str,
    ) -> ApiTask<AuditLogsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/admin/audit-logs?page={page}&limit={limit}&filter={}&search={}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(filter),
                encode_path_segment(search),
            )),
        )
    }

    pub fn record_audit_event_task(
        &self,
        session: &Session,
        action: &str,
        module: &str,
        detail: &str,
        details: Value,
    ) -> ApiTask<AuditEventRecordedResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!("{}/audit-events", session.endpoint.trim_end_matches('/')),
                Some(json!({
                    "action": action,
                    "module": module,
                    "detail": detail,
                    "details": details,
                })),
            ),
        )
    }

    pub fn list_notifications_task(&self, session: &Session) -> ApiTask<UserNotificationsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/notifications",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UserNotificationsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_notification_task(
        &self,
        session: &Session,
        title: &str,
        message: &str,
        notification_type: &str,
        link: &str,
        user_id: Option<&str>,
    ) -> ApiTask<UserNotification> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/notifications", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "title": title,
                "message": message,
                "type": notification_type,
                "link": link,
                "userId": user_id,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UserNotificationResponse>)
                .map(|payload| payload.notification);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn mark_notification_read_task(
        &self,
        session: &Session,
        notification_id: &str,
    ) -> ApiTask<NotificationMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/notifications/{}/read",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(notification_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UserNotificationResponse>)
                .map(|payload| NotificationMutation::Updated(payload.notification));
            set_result(&slot, parsed);
        });
        result
    }

    pub fn mark_all_notifications_read_task(
        &self,
        session: &Session,
    ) -> ApiTask<NotificationMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/notifications/mark-all-read",
                session.endpoint.trim_end_matches('/')
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UserNotificationsResponse>)
                .map(|payload| NotificationMutation::Replaced(payload.data));
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_notification_task(
        &self,
        session: &Session,
        notification_id: &str,
    ) -> ApiTask<NotificationMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/notifications/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(notification_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedNotificationResponse>)
                .and_then(|payload| {
                    payload
                        .deleted
                        .then_some(NotificationMutation::Deleted)
                        .ok_or_else(|| "Không thể xóa thông báo.".to_owned())
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn clear_notifications_task(&self, session: &Session) -> ApiTask<NotificationMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!("{}/notifications", session.endpoint.trim_end_matches('/')),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedNotificationResponse>)
                .and_then(|payload| {
                    payload
                        .deleted
                        .then_some(NotificationMutation::Deleted)
                        .ok_or_else(|| "Không thể xóa thông báo.".to_owned())
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_meeting_rooms_task(&self, session: &Session) -> ApiTask<MeetingRoomsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/meeting-rooms",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<MeetingRoomsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_meeting_room_task(
        &self,
        session: &Session,
        input: &MeetingRoomInput,
    ) -> ApiTask<MeetingRoom> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/meeting-rooms/rooms",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<MeetingRoomMutationResponse>)
                .map(|payload| payload.room);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_meeting_booking_task(
        &self,
        session: &Session,
        input: &MeetingBookingInput,
    ) -> ApiTask<MeetingBooking> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/meeting-rooms/bookings",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<MeetingBookingMutationResponse>)
                .map(|payload| payload.booking);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn cancel_meeting_booking_task(
        &self,
        session: &Session,
        booking_key: &str,
    ) -> ApiTask<MeetingBooking> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/meeting-rooms/bookings/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(booking_key)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<MeetingBookingMutationResponse>)
                .map(|payload| payload.booking);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_workflow_blueprints_task(
        &self,
        session: &Session,
    ) -> ApiTask<WorkflowBlueprintsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/workflows/blueprints",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowBlueprintsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_workflow_blueprint_task(
        &self,
        session: &Session,
        input: &WorkflowBlueprintInput,
    ) -> ApiTask<WorkflowBlueprint> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/workflows/blueprints",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowBlueprintMutationResponse>)
                .map(|payload| payload.blueprint);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_workflow_blueprint_status_task(
        &self,
        session: &Session,
        workflow_key: &str,
        status: &str,
    ) -> ApiTask<WorkflowBlueprint> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/workflows/blueprints/{}/status",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(workflow_key)
            ),
            Some(json!({ "status": status })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowBlueprintMutationResponse>)
                .map(|payload| payload.blueprint);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_workflow_requests_task(
        &self,
        session: &Session,
    ) -> ApiTask<WorkflowRequestsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/workflows/requests",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowRequestsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_workflow_collection_task(
        &self,
        session: &Session,
    ) -> ApiTask<WorkflowCollectionResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/workflows",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowCollectionResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_workflow_settings_task(
        &self,
        session: &Session,
    ) -> ApiTask<WorkflowSettingsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/workflow_settings",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowSettingsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_workflow_request_task(
        &self,
        session: &Session,
        input: &WorkflowRequestInput,
    ) -> ApiTask<WorkflowRequest> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/workflows/requests",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowRequestMutationResponse>)
                .map(|payload| payload.request);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn decide_workflow_request_task(
        &self,
        session: &Session,
        request_key: &str,
        input: &WorkflowRequestDecisionInput,
    ) -> ApiTask<WorkflowRequest> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/workflows/requests/{}/decisions",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(request_key)
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<WorkflowRequestMutationResponse>)
                .map(|payload| payload.request);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_proposals_task(
        &self,
        session: &Session,
    ) -> ApiTask<EmployeeProposalsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employee-proposals",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeProposalsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_employee_proposal_task(
        &self,
        session: &Session,
        proposal_id: &str,
    ) -> ApiTask<EmployeeProposal> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employee-proposals/{}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(proposal_id)
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeProposalResponse>)
                .map(|payload| payload.proposal);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_employee_proposal_task(
        &self,
        session: &Session,
        input: &EmployeeProposalInput,
    ) -> ApiTask<EmployeeProposal> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/employee-proposals",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeProposalResponse>)
                .map(|payload| payload.proposal);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn review_employee_proposal_task(
        &self,
        session: &Session,
        proposal_id: &str,
        input: &EmployeeProposalReviewInput,
    ) -> ApiTask<EmployeeProposal> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/employee-proposals/{}/review",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(proposal_id)
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeProposalResponse>)
                .map(|payload| payload.proposal);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_tasks_task(&self, session: &Session) -> ApiTask<TasksResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!("{}/tasks", session.endpoint.trim_end_matches('/')));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TasksResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_helpdesk_tickets_task(
        &self,
        session: &Session,
    ) -> ApiTask<HelpdeskTicketsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tickets",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskTicketsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_helpdesk_ticket_task(
        &self,
        session: &Session,
        input: &CreateHelpdeskTicketInput,
    ) -> ApiTask<HelpdeskTicketResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/tickets", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskTicketResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_helpdesk_ticket_task(
        &self,
        session: &Session,
        ticket_id: &str,
        status: &str,
    ) -> ApiTask<HelpdeskTicketResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/tickets/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(ticket_id)
            ),
            Some(json!(UpdateHelpdeskTicketInput {
                status: status.to_owned()
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskTicketResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_helpdesk_incidents_task(
        &self,
        session: &Session,
    ) -> ApiTask<HelpdeskIncidentsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tickets/incidents",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskIncidentsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_helpdesk_incident_task(
        &self,
        session: &Session,
        input: &CreateHelpdeskIncidentInput,
    ) -> ApiTask<HelpdeskIncidentResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/tickets/incidents",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskIncidentResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_helpdesk_incident_task(
        &self,
        session: &Session,
        incident_id: &str,
    ) -> ApiTask<HelpdeskIncidentDetailResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tickets/incidents/{}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(incident_id),
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskIncidentDetailResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn resolve_helpdesk_incident_task(
        &self,
        session: &Session,
        incident_id: &str,
        resolution_note: &str,
    ) -> ApiTask<HelpdeskIncidentResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/tickets/incidents/{}/resolve",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(incident_id)
            ),
            Some(json!(ResolveHelpdeskIncidentInput {
                resolution_note: resolution_note.to_owned(),
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HelpdeskIncidentResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_strategic_plans_task(&self, session: &Session) -> ApiTask<StrategicPlansResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!("{}/plans", session.endpoint.trim_end_matches('/')));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicPlansResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_strategic_plan_task(
        &self,
        session: &Session,
        input: &CreateStrategicPlanInput,
    ) -> ApiTask<StrategicPlan> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/plans", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicPlanResponse>)
                .map(|payload| payload.plan);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn complete_strategic_plan_task(
        &self,
        session: &Session,
        plan_id: &str,
    ) -> ApiTask<StrategicPlan> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/plans/{}/complete",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(plan_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicPlanResponse>)
                .map(|payload| payload.plan);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_strategic_milestones_task(
        &self,
        session: &Session,
    ) -> ApiTask<StrategicMilestonesResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/plan-milestones",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicMilestonesResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_strategic_milestone_task(
        &self,
        session: &Session,
        input: &CreateStrategicMilestoneInput,
    ) -> ApiTask<StrategicMilestone> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/plan-milestones", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicMilestoneResponse>)
                .map(|payload| payload.milestone);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn achieve_strategic_milestone_task(
        &self,
        session: &Session,
        milestone_id: &str,
    ) -> ApiTask<StrategicMilestone> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/plan-milestones/{}/achieve",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(milestone_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicMilestoneResponse>)
                .map(|payload| payload.milestone);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_plan_progress_task(&self, session: &Session) -> ApiTask<PlanProgressResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/plan-progress",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PlanProgressResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_plan_progress_task(
        &self,
        session: &Session,
        key: &str,
        input: &UpdatePlanProgressInput,
    ) -> ApiTask<PlanProgressEntry> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/plan-progress/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PlanProgressMutationResponse>)
                .map(|payload| payload.progress);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_plan_reports_task(
        &self,
        session: &Session,
        period: Option<&str>,
    ) -> ApiTask<PlanReportsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let url = match period {
            Some(period) => format!(
                "{}/plan-reports?period={}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(period)
            ),
            None => format!("{}/plan-reports", session.endpoint.trim_end_matches('/')),
        };
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PlanReportsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_plan_report_task(
        &self,
        session: &Session,
        input: &PlanReportWriteInput,
    ) -> ApiTask<PlanReportEntry> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/plan-reports", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PlanReportMutationResponse>)
                .map(|payload| payload.report);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_plan_report_task(
        &self,
        session: &Session,
        report_id: &str,
        input: &PlanReportWriteInput,
    ) -> ApiTask<PlanReportEntry> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/plan-reports/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(report_id)
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PlanReportMutationResponse>)
                .map(|payload| payload.report);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_strategic_okrs_task(&self, session: &Session) -> ApiTask<StrategicOkrsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/plan-okrs",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicOkrsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_strategic_okr_task(
        &self,
        session: &Session,
        input: &CreateStrategicOkrInput,
    ) -> ApiTask<StrategicOkr> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/plan-okrs", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<StrategicOkrMutationResponse>)
                .map(|payload| payload.okr);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_plan_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyPlanImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/plan-collections/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyPlanImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_plan_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyPlanImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/plan-collections/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyPlanImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_crm_operations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyCrmOperationsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/crm-operations/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyCrmOperationsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_crm_operations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyCrmOperationsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/crm-operations/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyCrmOperationsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_finance_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyFinanceImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/finance/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyFinanceImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_finance_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyFinanceImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/finance/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyFinanceImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_crm_contacts_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyCrmContactsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/crm-contacts/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyCrmContactsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_crm_contacts_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyCrmContactsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/crm-contacts/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyCrmContactsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_helpdesk_tickets_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyHelpdeskTicketImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/helpdesk-tickets/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyHelpdeskTicketImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_helpdesk_tickets_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyHelpdeskTicketImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/helpdesk-tickets/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyHelpdeskTicketImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_helpdesk_incidents_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyHelpdeskIncidentImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/helpdesk-incidents/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyHelpdeskIncidentImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_helpdesk_incidents_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyHelpdeskIncidentImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/helpdesk-incidents/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyHelpdeskIncidentImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_items_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetItemsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-items/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetItemsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_items_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetItemsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-items/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetItemsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_reports_catalog_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyReportsCatalogImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/reports-catalog/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyReportsCatalogImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_reports_catalog_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyReportsCatalogImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/reports-catalog/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyReportsCatalogImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_allocations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetAllocationsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-allocations/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetAllocationsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_allocations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetAllocationsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-allocations/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetAllocationsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_transfers_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetTransfersImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-transfers/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetTransfersImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_transfers_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetTransfersImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-transfers/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetTransfersImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_disposals_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetDisposalsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-disposals/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetDisposalsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_disposals_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetDisposalsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-disposals/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetDisposalsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_depreciations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetDepreciationsImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-depreciations/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetDepreciationsImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_depreciations_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetDepreciationsImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-depreciations/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetDepreciationsImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_asset_maintenances_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyAssetMaintenancesImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-maintenances/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetMaintenancesImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_asset_maintenances_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyAssetMaintenancesImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/asset-maintenances/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyAssetMaintenancesImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn preview_legacy_employee_bank_import_task(
        &self,
        session: &Session,
        bundle: &Value,
    ) -> ApiTask<LegacyEmployeeBankImportPreview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/employee-bank-accounts/preview",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "bundle": bundle })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyEmployeeBankImportPreviewResponse>)
                .map(|payload| payload.preview);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn apply_legacy_employee_bank_import_task(
        &self,
        session: &Session,
        bundle: &Value,
        expected_payload_sha256: &str,
        confirmation: &str,
    ) -> ApiTask<LegacyEmployeeBankImportResult> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/legacy-import/employee-bank-accounts/apply",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "bundle": bundle,
                "expectedPayloadSha256": expected_payload_sha256,
                "confirmation": confirmation,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyEmployeeBankImportResultResponse>)
                .map(|payload| payload.import);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_legacy_employee_bank_quarantine_task(
        &self,
        session: &Session,
        page: usize,
        page_size: usize,
    ) -> ApiTask<LegacyEmployeeBankQuarantineResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/bank-import/quarantine?page={page}&pageSize={page_size}",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyEmployeeBankQuarantineResponseEnvelope>)
                .map(|payload| LegacyEmployeeBankQuarantineResponse {
                    data: payload.data,
                    pagination: payload.pagination,
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn adopt_legacy_employee_bank_quarantine_task(
        &self,
        session: &Session,
        item: &LegacyEmployeeBankQuarantineItem,
        employee_code: &str,
        confirmation: &str,
        bank_name: &str,
        account_number: &str,
        account_holder: &str,
        branch: &str,
        note: &str,
        review_reason: &str,
    ) -> ApiTask<LegacyEmployeeBankQuarantineReview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/bank-import/quarantine/{}/adopt",
                session.endpoint.trim_end_matches('/'),
                item.source_key_sha256
            ),
            Some(json!({
                "employeeCode": employee_code,
                "confirmation": confirmation,
                "bankName": bank_name,
                "accountNumber": account_number,
                "accountHolder": account_holder,
                "branch": branch,
                "note": note,
                "reviewReason": review_reason,
            })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyEmployeeBankQuarantineReviewResponse>)
                .map(|payload| payload.review);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn dismiss_legacy_employee_bank_quarantine_task(
        &self,
        session: &Session,
        item: &LegacyEmployeeBankQuarantineItem,
        confirmation: &str,
        review_reason: &str,
    ) -> ApiTask<LegacyEmployeeBankQuarantineReview> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/bank-import/quarantine/{}/dismiss",
                session.endpoint.trim_end_matches('/'),
                item.source_key_sha256
            ),
            Some(json!({ "confirmation": confirmation, "reviewReason": review_reason })),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LegacyEmployeeBankQuarantineReviewResponse>)
                .map(|payload| payload.review);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_task_assignees_task(&self, session: &Session) -> ApiTask<TaskAssigneesResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tasks/assignees",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskAssigneesResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_task_task(&self, session: &Session, task_id: &str) -> ApiTask<EnterpriseTask> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tasks/{}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(task_id)
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_owned(), "application/json".to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskResponse>)
                .map(|payload| payload.task);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_task_task(
        &self,
        session: &Session,
        input: &CreateTaskInput,
    ) -> ApiTask<EnterpriseTask> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/tasks", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskResponse>)
                .map(|payload| payload.task);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_task_batch_task(
        &self,
        session: &Session,
        input: &CreateTaskBatchInput,
    ) -> ApiTask<CreateTasksResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/tasks/batch", session.endpoint.trim_end_matches('/')),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CreateTasksResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_task_task(
        &self,
        session: &Session,
        task_id: &str,
        input: &UpdateTaskInput,
    ) -> ApiTask<EnterpriseTask> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/tasks/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(task_id)
            ),
            Some(json!(input)),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskResponse>)
                .map(|payload| payload.task);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_task_task(&self, session: &Session, task_id: &str) -> ApiTask<bool> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/tasks/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(task_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedTaskResponse>)
                .map(|payload| payload.deleted);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn add_task_comment_task(
        &self,
        session: &Session,
        task_id: &str,
        content: &str,
    ) -> ApiTask<EnterpriseTask> {
        self.task_mutation_task(
            session,
            task_id,
            "POST",
            "comments",
            json!({ "content": content }),
        )
    }

    pub fn add_task_report_task(
        &self,
        session: &Session,
        task_id: &str,
        input: &CreateTaskReportInput,
    ) -> ApiTask<EnterpriseTask> {
        self.task_mutation_task(session, task_id, "POST", "reports", json!(input))
    }

    pub fn upload_task_attachment_task(
        &self,
        session: &Session,
        task_id: &str,
        file: &crate::file_transfer::PickedFile,
    ) -> ApiTask<TaskReportAttachment> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        if file.bytes.len() > crate::file_transfer::MAX_FILE_SIZE {
            set_result(&slot, Err("Tệp vượt quá giới hạn 50 MB.".to_owned()));
            return result;
        }
        let mut request = Request::post(
            format!(
                "{}/tasks/{}/attachments",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(task_id)
            ),
            file.bytes.clone(),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Content-Type".to_owned(), file.mime_type.clone());
        request
            .headers
            .insert("X-File-Name".to_owned(), encode_path_segment(&file.name));
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskAttachmentResponse>)
                .map(|payload| payload.attachment);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn download_task_attachment_task(
        &self,
        session: &Session,
        task_id: &str,
        attachment_id: &str,
    ) -> ApiTask<Vec<u8>> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/tasks/{}/attachments/{}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(task_id),
            encode_path_segment(attachment_id)
        ));
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_bytes_response);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_task_attachment_task(
        &self,
        session: &Session,
        task_id: &str,
        attachment_id: &str,
    ) -> ApiTask<bool> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/tasks/{}/attachments/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(task_id),
                encode_path_segment(attachment_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedTaskResponse>)
                .map(|payload| payload.deleted);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_task_checklist_task(
        &self,
        session: &Session,
        task_id: &str,
        checklist_id: &str,
        completed: Option<bool>,
    ) -> ApiTask<EnterpriseTask> {
        let body =
            completed.map_or_else(|| json!({}), |completed| json!({ "completed": completed }));
        self.task_mutation_task(
            session,
            task_id,
            "PATCH",
            &format!("checklists/{}", encode_path_segment(checklist_id)),
            body,
        )
    }

    fn task_mutation_task(
        &self,
        session: &Session,
        task_id: &str,
        method: &str,
        suffix: &str,
        body: Value,
    ) -> ApiTask<EnterpriseTask> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            method,
            format!(
                "{}/tasks/{}/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(task_id),
                suffix
            ),
            Some(body),
        );
        request.headers.insert(
            "Authorization".to_owned(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<TaskResponse>)
                .map(|payload| payload.task);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_system_broadcasts_task(
        &self,
        session: &Session,
    ) -> ApiTask<SystemBroadcastsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/system/broadcasts",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<SystemBroadcastsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_system_broadcast_task(
        &self,
        session: &Session,
        input: &SystemBroadcastInput,
    ) -> ApiTask<SystemBroadcastMutation> {
        self.mutate_system_broadcast_task(session, "POST", None, input)
    }

    pub fn update_system_broadcast_task(
        &self,
        session: &Session,
        broadcast_id: &str,
        input: &SystemBroadcastInput,
    ) -> ApiTask<SystemBroadcastMutation> {
        self.mutate_system_broadcast_task(session, "PATCH", Some(broadcast_id), input)
    }

    fn mutate_system_broadcast_task(
        &self,
        session: &Session,
        method: &str,
        broadcast_id: Option<&str>,
        input: &SystemBroadcastInput,
    ) -> ApiTask<SystemBroadcastMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let path = broadcast_id
            .map(|id| format!("/system/broadcasts/{}", encode_path_segment(id)))
            .unwrap_or_else(|| "/system/broadcasts".to_owned());
        let mut request = json_request(
            method,
            format!("{}{}", session.endpoint.trim_end_matches('/'), path),
            Some(json!({
                "title": input.title,
                "content": input.content,
                "type": input.broadcast_type,
                "targetAudience": input.target_audience,
                "channels": input.channels,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<SystemBroadcastResponse>)
                .map(|payload| SystemBroadcastMutation::Saved(payload.record));
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_system_broadcast_task(
        &self,
        session: &Session,
        broadcast_id: &str,
    ) -> ApiTask<SystemBroadcastMutation> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/system/broadcasts/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(broadcast_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedNotificationResponse>)
                .and_then(|payload| {
                    payload
                        .deleted
                        .then_some(SystemBroadcastMutation::Deleted)
                        .ok_or_else(|| "Không thể xóa bản nháp thông báo.".to_owned())
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_activation_email_template_task(
        &self,
        session: &Session,
    ) -> ApiTask<ActivationEmailTemplateResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/system/notification-templates/account-activation",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ActivationEmailTemplateResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn save_activation_email_template_task(
        &self,
        session: &Session,
        template: &ActivationEmailTemplate,
    ) -> ApiTask<ActivationEmailTemplate> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/system/notification-templates/account-activation",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "subject": template.subject,
                "heading": template.heading,
                "body": template.body,
                "buttonLabel": template.button_label,
                "footer": template.footer,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ActivationEmailTemplateMutationResponse>)
                .map(|payload| payload.template);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn dashboard_stats_task(&self, session: &Session) -> ApiTask<DashboardStats> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/dashboard/stats",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DashboardStats>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_org_units_task(&self, session: &Session) -> ApiTask<OrgUnitsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/business_org_units",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<OrgUnitsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_asset_items_task(&self, session: &Session) -> ApiTask<AssetItemsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/collections/asset_items",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn list_generic_collection_task(
        &self,
        session: &Session,
        scope: &str,
    ) -> ApiTask<GenericCollectionResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/collections/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(scope)
            )),
        )
    }

    pub fn create_generic_collection_record_task(
        &self,
        session: &Session,
        scope: &str,
        record: &Value,
        expected_revision: Option<&str>,
    ) -> ApiTask<GenericRecordResponse> {
        let mut payload = json!({ "record": record });
        if let Some(revision) = expected_revision {
            payload["expectedRevision"] = json!(revision);
        }
        let request = json_request(
            "POST",
            format!(
                "{}/collections/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(scope)
            ),
            Some(payload),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn patch_generic_collection_record_task(
        &self,
        session: &Session,
        scope: &str,
        key: &str,
        patch: &Value,
        expected_revision: Option<&str>,
    ) -> ApiTask<GenericRecordResponse> {
        let mut payload = json!({ "patch": patch });
        if let Some(revision) = expected_revision {
            payload["expectedRevision"] = json!(revision);
        }
        let request = json_request(
            "PATCH",
            format!(
                "{}/collections/{}/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(scope),
                encode_path_segment(key)
            ),
            Some(payload),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn replace_asset_items_task(
        &self,
        session: &Session,
        items: &[AssetItem],
        expected_revision: &str,
    ) -> ApiTask<AssetItemsResponse> {
        let request = json_request(
            "PUT",
            format!(
                "{}/collections/asset_items",
                session.endpoint.trim_end_matches('/')
            ),
            Some(asset_items_replace_payload(items, expected_revision)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_allocations_task(
        &self,
        session: &Session,
    ) -> ApiTask<AssetAllocationsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/collections/asset_allocations",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn replace_asset_allocations_task(
        &self,
        session: &Session,
        allocations: &[AssetAllocation],
        expected_revision: &str,
    ) -> ApiTask<AssetAllocationsResponse> {
        let request = json_request(
            "PUT",
            format!(
                "{}/collections/asset_allocations",
                session.endpoint.trim_end_matches('/')
            ),
            Some(asset_allocations_replace_payload(
                allocations,
                expected_revision,
            )),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_my_asset_allocations_task(
        &self,
        session: &Session,
    ) -> ApiTask<AssetAllocationsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/employee/asset-allocations",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn acknowledge_asset_receipt_task(
        &self,
        session: &Session,
        allocation_key: &str,
    ) -> ApiTask<AssetAllocationMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/employee/asset-allocations/{allocation_key}/acknowledge",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn confirm_asset_return_to_warehouse_task(
        &self,
        session: &Session,
        allocation_key: &str,
    ) -> ApiTask<AssetAllocationMutationResponse> {
        let request = json_request(
            "PATCH",
            format!(
                "{}/assets/allocations/{allocation_key}/receive",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_transfers_task(&self, session: &Session) -> ApiTask<AssetTransfersResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/transfers",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn list_asset_maintenances_task(
        &self,
        session: &Session,
    ) -> ApiTask<AssetMaintenancesResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/maintenance",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_asset_maintenance_task(
        &self,
        session: &Session,
        maintenance: &CreateAssetMaintenance,
    ) -> ApiTask<AssetMaintenanceMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/maintenance",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(maintenance)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn perform_asset_maintenance_task(
        &self,
        session: &Session,
        key: &str,
        performance: &PerformAssetMaintenance,
    ) -> ApiTask<AssetMaintenanceMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/maintenance/{key}/perform",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(performance)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_repairs_task(&self, session: &Session) -> ApiTask<AssetRepairsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/repairs",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_asset_repair_task(
        &self,
        session: &Session,
        repair: &CreateAssetRepair,
    ) -> ApiTask<AssetRepairMutationResponse> {
        let request = json_request(
            "POST",
            format!("{}/assets/repairs", session.endpoint.trim_end_matches('/')),
            Some(json!(repair)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn approve_asset_repair_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<AssetRepairMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/repairs/{key}/approve",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn complete_asset_repair_task(
        &self,
        session: &Session,
        key: &str,
        completion: &CompleteAssetRepair,
    ) -> ApiTask<AssetRepairMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/repairs/{key}/complete",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(completion)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_disposals_task(&self, session: &Session) -> ApiTask<AssetDisposalsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/disposals",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_asset_disposal_task(
        &self,
        session: &Session,
        disposal: &CreateAssetDisposal,
    ) -> ApiTask<AssetDisposalMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/disposals",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(disposal)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn approve_asset_disposal_task(
        &self,
        session: &Session,
        key: &str,
        approval: &ApproveAssetDisposal,
    ) -> ApiTask<AssetDisposalMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/disposals/{key}/approve",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(approval)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_depreciations_task(
        &self,
        session: &Session,
    ) -> ApiTask<AssetDepreciationsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/depreciations",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_asset_depreciation_task(
        &self,
        session: &Session,
        depreciation: &CreateAssetDepreciation,
    ) -> ApiTask<AssetDepreciationMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/depreciations",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(depreciation)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn toggle_asset_depreciation_status_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<AssetDepreciationMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/depreciations/{}/toggle-status",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn run_asset_depreciation_monthly_task(
        &self,
        session: &Session,
        run: &RunAssetDepreciation,
    ) -> ApiTask<AssetDepreciationRunResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/depreciations/run-monthly",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(run)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn create_asset_transfer_task(
        &self,
        session: &Session,
        transfer: &CreateAssetTransfer,
    ) -> ApiTask<AssetTransferMutationResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/transfers",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(transfer)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn approve_asset_transfer_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<AssetTransferMutationResponse> {
        let request = json_request(
            "PATCH",
            format!(
                "{}/assets/transfers/{key}/approve",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn reject_asset_transfer_task(
        &self,
        session: &Session,
        key: &str,
        reason: &str,
    ) -> ApiTask<AssetTransferMutationResponse> {
        let request = json_request(
            "PATCH",
            format!(
                "{}/assets/transfers/{key}/reject",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "reason": reason })),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn receive_asset_transfer_task(
        &self,
        session: &Session,
        key: &str,
        condition: &str,
    ) -> ApiTask<AssetTransferMutationResponse> {
        let request = json_request(
            "PATCH",
            format!(
                "{}/assets/transfers/{key}/receive",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "condition": condition })),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_asset_audits_task(&self, session: &Session) -> ApiTask<AssetAuditsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/audits",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn get_asset_audit_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<AssetAuditResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/assets/audits/{key}",
                session.endpoint.trim_end_matches('/')
            )),
        )
    }

    pub fn create_asset_audit_task(
        &self,
        session: &Session,
        audit: &CreateAssetAudit,
    ) -> ApiTask<AssetAuditResponse> {
        let request = json_request(
            "POST",
            format!("{}/assets/audits", session.endpoint.trim_end_matches('/')),
            Some(json!(audit)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn record_asset_audit_scan_task(
        &self,
        session: &Session,
        key: &str,
        scan: &RecordAssetAuditScan,
    ) -> ApiTask<AssetAuditResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/audits/{key}/scans",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(scan)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn close_asset_audit_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<AssetAuditResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/audits/{key}/close",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({})),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn submit_asset_audit_resolution_task(
        &self,
        session: &Session,
        key: &str,
        proposal: &SubmitAssetAuditResolution,
    ) -> ApiTask<AssetAuditResponse> {
        let request = json_request(
            "POST",
            format!(
                "{}/assets/audits/{key}/submit-resolution",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!(proposal)),
        );
        self.authenticated_request_task(session, request)
    }

    pub fn list_attendance_shifts_task(
        &self,
        session: &Session,
    ) -> ApiTask<AttendanceShiftsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/attendance_shifts",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AttendanceShiftsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn replace_attendance_shifts_task(
        &self,
        session: &Session,
        shifts: &[AttendanceShift],
        expected_revision: &str,
    ) -> ApiTask<AttendanceShiftsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/collections/attendance_shifts",
                session.endpoint.trim_end_matches('/')
            ),
            Some(attendance_shift_replace_payload(shifts, expected_revision)),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AttendanceShiftsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_leave_requests_task(&self, session: &Session) -> ApiTask<LeaveRequestsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/leave_requests",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LeaveRequestsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn replace_leave_requests_task(
        &self,
        session: &Session,
        requests: &[LeaveRequestRecord],
        expected_revision: &str,
    ) -> ApiTask<LeaveRequestsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/collections/leave_requests",
                session.endpoint.trim_end_matches('/')
            ),
            Some(leave_requests_replace_payload(requests, expected_revision)),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LeaveRequestsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_leave_requests_task(
        &self,
        session: &Session,
    ) -> ApiTask<EmployeeLeaveRequestsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/leave-requests",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeLeaveRequestsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_employee_leave_request_task(
        &self,
        session: &Session,
        input: &CreateEmployeeLeaveRequest,
    ) -> ApiTask<EmployeeLeaveRequestResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/leave-requests", session.endpoint.trim_end_matches('/')),
            Some(serde_json::to_value(input).expect("serialize employee leave request")),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeLeaveRequestResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn decide_employee_leave_request_task(
        &self,
        session: &Session,
        request_id: &str,
        status: &str,
        review_note: &str,
    ) -> ApiTask<EmployeeLeaveRequestResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/leave-requests/{}/decision",
                session.endpoint.trim_end_matches('/'),
                request_id
            ),
            Some(json!({ "status": status, "reviewNote": review_note })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeLeaveRequestResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_leave_request_events_task(
        &self,
        session: &Session,
        request_id: &str,
    ) -> ApiTask<EmployeeLeaveRequestEventsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/leave-requests/{}/events",
            session.endpoint.trim_end_matches('/'),
            request_id
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeLeaveRequestEventsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_overtime_requests_task(
        &self,
        session: &Session,
    ) -> ApiTask<EmployeeOvertimeRequestsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/overtime-requests",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeOvertimeRequestsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_employee_overtime_request_task(
        &self,
        session: &Session,
        input: &CreateEmployeeOvertimeRequest,
    ) -> ApiTask<EmployeeOvertimeRequestResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/overtime-requests",
                session.endpoint.trim_end_matches('/')
            ),
            Some(serde_json::to_value(input).expect("serialize employee overtime request")),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeOvertimeRequestResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn decide_employee_overtime_request_task(
        &self,
        session: &Session,
        request_id: &str,
        status: &str,
        review_note: &str,
    ) -> ApiTask<EmployeeOvertimeRequestResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/overtime-requests/{}/decision",
                session.endpoint.trim_end_matches('/'),
                request_id
            ),
            Some(json!({ "status": status, "reviewNote": review_note })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeOvertimeRequestResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_overtime_request_events_task(
        &self,
        session: &Session,
        request_id: &str,
    ) -> ApiTask<EmployeeOvertimeRequestEventsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/overtime-requests/{}/events",
            session.endpoint.trim_end_matches('/'),
            request_id
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeOvertimeRequestEventsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_attendance_shift_assignments_task(
        &self,
        session: &Session,
    ) -> ApiTask<AttendanceShiftAssignmentsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/attendance/shift-assignments",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AttendanceShiftAssignmentsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_attendance_shift_assignment_task(
        &self,
        session: &Session,
        input: &CreateAttendanceShiftAssignment,
    ) -> ApiTask<AttendanceShiftAssignmentResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/attendance/shift-assignments",
                session.endpoint.trim_end_matches('/')
            ),
            Some(serde_json::to_value(input).expect("serialize shift assignment")),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AttendanceShiftAssignmentResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_attendance_shift_assignment_events_task(
        &self,
        session: &Session,
        assignment_id: &str,
    ) -> ApiTask<AttendanceShiftAssignmentEventsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/attendance/shift-assignments/{assignment_id}/events",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AttendanceShiftAssignmentEventsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn replace_org_units_task(
        &self,
        session: &Session,
        units: &[OrgUnit],
    ) -> ApiTask<OrgUnitsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/collections/business_org_units",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "records": units })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<OrgUnitsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_org_unit_task(&self, session: &Session, key: &str) -> ApiTask<bool> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/collections/business_org_units/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedCollectionRecord>)
                .map(|response| response.deleted);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_users_task(
        &self,
        session: &Session,
        page: usize,
        limit: usize,
        search: &str,
        filter: &str,
    ) -> ApiTask<UsersPage> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let url = format!(
            "{}/users?page={page}&limit={limit}&search={}&filter={}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(search.trim()),
            encode_path_segment(filter),
        );
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UsersPage>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_crm_contacts_task(
        &self,
        session: &Session,
        contact_type: Option<&str>,
    ) -> ApiTask<CrmContactsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut url = format!("{}/crm/contacts", session.endpoint.trim_end_matches('/'));
        if let Some(contact_type) = contact_type {
            url.push_str("?type=");
            url.push_str(&encode_path_segment(contact_type));
        }
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmContactsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_crm_contact_task(
        &self,
        session: &Session,
        contact: &CreateCrmContactInput,
    ) -> ApiTask<CrmContactResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/crm/contacts", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(contact).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmContactResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_crm_supplier_evaluations_task(
        &self,
        session: &Session,
    ) -> ApiTask<CrmSupplierEvaluationsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/crm/supplier-evaluations",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmSupplierEvaluationsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_crm_supplier_evaluation_task(
        &self,
        session: &Session,
        input: &CreateCrmSupplierEvaluationInput,
    ) -> ApiTask<CrmSupplierEvaluationResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/crm/supplier-evaluations",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmSupplierEvaluationResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_crm_feedback_task(
        &self,
        session: &Session,
    ) -> ApiTask<CrmCustomerFeedbackListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/crm/feedback",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmCustomerFeedbackListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_crm_feedback_task(
        &self,
        session: &Session,
        input: &CreateCrmCustomerFeedbackInput,
    ) -> ApiTask<CrmCustomerFeedbackResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/crm/feedback", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmCustomerFeedbackResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn resolve_crm_feedback_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<CrmCustomerFeedbackResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/crm/feedback/{}/resolve",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            Some(json!({})),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CrmCustomerFeedbackResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_training_courses_task(
        &self,
        session: &Session,
    ) -> ApiTask<HrTrainingCoursesResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/training-courses",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrTrainingCoursesResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_training_course_task(
        &self,
        session: &Session,
        input: &CreateHrTrainingCourseInput,
    ) -> ApiTask<HrTrainingCourseResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/training-courses",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrTrainingCourseResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_certificates_task(&self, session: &Session) -> ApiTask<HrCertificatesResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/certificates",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrCertificatesResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_contracts_task(&self, session: &Session) -> ApiTask<ContractsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/contracts",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ContractsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_contract_task(
        &self,
        session: &Session,
        contract_id: &str,
    ) -> ApiTask<ContractResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/contracts/{}",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(contract_id)
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ContractResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_contract_task(
        &self,
        session: &Session,
        input: Value,
    ) -> ApiTask<ContractResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "POST",
                format!("{}/contracts", session.endpoint.trim_end_matches('/')),
                Some(input),
            ),
        )
    }

    pub fn update_contract_task(
        &self,
        session: &Session,
        contract_id: &str,
        input: Value,
    ) -> ApiTask<ContractResponse> {
        self.authenticated_request_task(
            session,
            json_request(
                "PATCH",
                format!(
                    "{}/contracts/{}",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(contract_id)
                ),
                Some(input),
            ),
        )
    }

    pub fn archive_contract_task(&self, session: &Session, contract_id: &str) -> ApiTask<Value> {
        self.authenticated_request_task(
            session,
            json_request(
                "DELETE",
                format!(
                    "{}/contracts/{}",
                    session.endpoint.trim_end_matches('/'),
                    encode_path_segment(contract_id)
                ),
                None,
            ),
        )
    }

    pub fn create_hr_certificate_task(
        &self,
        session: &Session,
        input: &CreateHrCertificateInput,
    ) -> ApiTask<HrCertificateResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/hr/certificates", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrCertificateResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_uniforms_task(&self, session: &Session) -> ApiTask<HrUniformsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/uniforms",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrUniformsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_uniform_task(
        &self,
        session: &Session,
        input: &CreateHrUniformInput,
    ) -> ApiTask<HrUniformResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/hr/uniforms", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrUniformResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn handover_hr_uniform_task(
        &self,
        session: &Session,
        key: &str,
    ) -> ApiTask<HrUniformResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/hr/uniforms/{}/handover",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            Some(json!({})),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrUniformResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_onboarding_task(&self, session: &Session) -> ApiTask<HrOnboardingListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/onboarding",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrOnboardingListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_onboarding_task(
        &self,
        session: &Session,
        input: &CreateHrOnboardingInput,
    ) -> ApiTask<HrOnboardingResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/hr/onboarding", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrOnboardingResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_job_openings_task(&self, session: &Session) -> ApiTask<HrJobOpeningsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/recruitment-openings",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrJobOpeningsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_job_opening_task(
        &self,
        session: &Session,
        input: &CreateHrJobOpeningInput,
    ) -> ApiTask<HrJobOpeningResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/recruitment-openings",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrJobOpeningResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_headcount_quotas_task(
        &self,
        session: &Session,
    ) -> ApiTask<HrHeadcountQuotasResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/headcount-quotas",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrHeadcountQuotasResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_headcount_quota_task(
        &self,
        session: &Session,
        input: &CreateHrHeadcountQuotaInput,
    ) -> ApiTask<HrHeadcountQuotaResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/headcount-quotas",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrHeadcountQuotaResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_rewards_task(&self, session: &Session) -> ApiTask<HrRewardsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/rewards",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrRewardsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_reward_task(
        &self,
        session: &Session,
        input: &CreateHrRewardInput,
    ) -> ApiTask<HrRewardResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/hr/rewards", session.endpoint.trim_end_matches('/')),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrRewardResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn approve_hr_reward_task(
        &self,
        session: &Session,
        reward_key: &str,
    ) -> ApiTask<HrRewardResponse> {
        self.transition_hr_reward_task(session, reward_key, "approve")
    }

    pub fn record_hr_reward_award_task(
        &self,
        session: &Session,
        reward_key: &str,
    ) -> ApiTask<HrRewardResponse> {
        self.transition_hr_reward_task(session, reward_key, "award")
    }

    fn transition_hr_reward_task(
        &self,
        session: &Session,
        reward_key: &str,
        transition: &str,
    ) -> ApiTask<HrRewardResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/hr/rewards/{reward_key}/{transition}",
                session.endpoint.trim_end_matches('/')
            ),
            Some(serde_json::json!({})),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrRewardResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employee_bank_accounts_task(
        &self,
        session: &Session,
    ) -> ApiTask<EmployeeBankAccountsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employee/bank-accounts",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeBankAccountsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_employee_bank_account_task(
        &self,
        session: &Session,
        input: &CreateEmployeeBankAccountInput,
    ) -> ApiTask<EmployeeBankAccountResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/employee/bank-accounts",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeBankAccountResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_bank_accounts_task(
        &self,
        session: &Session,
    ) -> ApiTask<EmployeeBankAccountsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/bank-accounts",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeBankAccountsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_bank_account_task(
        &self,
        session: &Session,
        input: &CreateHrBankAccountInput,
    ) -> ApiTask<EmployeeBankAccountResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/bank-accounts",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeBankAccountResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn transition_hr_bank_account_task(
        &self,
        session: &Session,
        account_id: &str,
        action: &str,
        reason: &str,
    ) -> ApiTask<EmployeeBankAccountResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/hr/bank-accounts/{}/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(account_id),
                action
            ),
            Some(serde_json::json!({ "reason": reason })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeBankAccountResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_employee_history_task(
        &self,
        session: &Session,
    ) -> ApiTask<HrEmployeeHistoryRecordsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/employee-history",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrEmployeeHistoryRecordsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_employee_history_task(
        &self,
        session: &Session,
        input: &CreateHrEmployeeHistoryInput,
    ) -> ApiTask<HrEmployeeHistoryResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/employee-history",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrEmployeeHistoryResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_hr_performance_reviews_task(
        &self,
        session: &Session,
    ) -> ApiTask<HrPerformanceReviewsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/hr/performance-reviews",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrPerformanceReviewsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_hr_performance_review_task(
        &self,
        session: &Session,
        input: &CreateHrPerformanceReviewInput,
    ) -> ApiTask<HrPerformanceReviewResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/hr/performance-reviews",
                session.endpoint.trim_end_matches('/')
            ),
            serde_json::to_value(input).ok(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrPerformanceReviewResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn approve_hr_performance_review_task(
        &self,
        session: &Session,
        review_key: &str,
    ) -> ApiTask<HrPerformanceReviewResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/hr/performance-reviews/{review_key}/approve",
                session.endpoint.trim_end_matches('/')
            ),
            Some(serde_json::json!({})),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<HrPerformanceReviewResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_admin_sessions_task(&self, session: &Session) -> ApiTask<AuthSessionsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/admin/sessions",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AuthSessionsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn revoke_admin_session_task(
        &self,
        session: &Session,
        session_id: &str,
    ) -> ApiTask<SessionMutationResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/admin/sessions/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(session_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<SessionMutationResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn logout_task(&self, session: &Session) -> ApiTask<SessionMutationResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/auth/logout", session.endpoint.trim_end_matches('/')),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<SessionMutationResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn introspect_session_task(&self, session: &Session) -> ApiTask<AuthSessionCheck> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/auth/introspect",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let check = match response {
                Err(error) => AuthSessionCheck::Unavailable(error.to_string()),
                Ok(response) if matches!(response.status, 401 | 403) => AuthSessionCheck::Invalid,
                Ok(response) => match decode_response::<AuthIntrospectionResponse>(response) {
                    Ok(payload) if payload.active => AuthSessionCheck::Active(payload.user),
                    Ok(_) => AuthSessionCheck::Invalid,
                    Err(error) => AuthSessionCheck::Unavailable(error),
                },
            };
            set_result(&slot, Ok(check));
        });
        result
    }

    pub fn create_user_task(
        &self,
        session: &Session,
        name: &str,
        email: &str,
        employee_code: &str,
        department: &str,
        password: &str,
        role: &str,
    ) -> ApiTask<AdminUser> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/users", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "name": name,
                "email": email,
                "employeeCode": employee_code,
                "department": department,
                "password": password,
                "role": role,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AdminUserResponse>)
                .map(|payload| payload.user);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn set_user_active_task(
        &self,
        session: &Session,
        user_id: &str,
        is_active: bool,
    ) -> ApiTask<AdminUser> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!("{}/users/{user_id}", session.endpoint.trim_end_matches('/')),
            Some(json!({ "isActive": is_active })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AdminUserResponse>)
                .map(|payload| payload.user);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employees_task(&self, session: &Session) -> ApiTask<EmployeeListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employees",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn my_employee_profile_task(&self, session: &Session) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employees/me",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn my_employee_payslips_task(
        &self,
        session: &Session,
        page: usize,
        limit: usize,
        search: &str,
    ) -> ApiTask<EmployeePayslipsResponse> {
        self.authenticated_request_task(
            session,
            Request::get(format!(
                "{}/employee/payslips?page={page}&limit={limit}&search={}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(search),
            )),
        )
    }

    pub fn save_my_employee_contact_task(
        &self,
        session: &Session,
        phone: &str,
        address: &str,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!("{}/employees/me", session.endpoint.trim_end_matches('/')),
            Some(employee_contact_update_payload(phone, address)),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_employee_task(
        &self,
        session: &Session,
        code: &str,
        name: &str,
        email: &str,
        phone: &str,
        department: &str,
        position: &str,
        status: &str,
        join_date: &str,
        salary_base: i64,
    ) -> ApiTask<EmployeeCreateResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/employees", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "code": code,
                "name": name,
                "email": email,
                "phone": phone,
                "department": department,
                "position": position,
                "status": status,
                "joinDate": join_date,
                "salaryBase": salary_base,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeCreateResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_employee_task(
        &self,
        session: &Session,
        employee_id: &str,
        code: &str,
        name: &str,
        email: &str,
        phone: &str,
        department: &str,
        position: &str,
        status: &str,
        join_date: &str,
        salary_base: i64,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/employees/{employee_id}",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "code": code,
                "name": name,
                "email": email,
                "phone": phone,
                "department": department,
                "position": position,
                "status": status,
                "joinDate": join_date,
                "salaryBase": salary_base,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn retire_employee_task(
        &self,
        session: &Session,
        employee_id: &str,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/employees/{employee_id}",
                session.endpoint.trim_end_matches('/')
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn resend_employee_activation_task(
        &self,
        session: &Session,
        employee_id: &str,
    ) -> ApiTask<EmployeeActivationResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/employees/{employee_id}/activation",
                session.endpoint.trim_end_matches('/')
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeActivationResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn login_task(
        &self,
        endpoint: &str,
        email: &str,
        password: &str,
        mode: StorageMode,
    ) -> ApiTask<Session> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let endpoint = endpoint.trim_end_matches('/').to_string();
        let request = json_request(
            "POST",
            format!("{endpoint}/auth/login"),
            Some(json!({
                "email": email.trim(),
                "password": password,
            })),
        );

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(|response| decode_response::<LoginResponse>(response))
                .map(|payload| Session {
                    token: payload.access_token,
                    session_id: payload.session_id,
                    user: payload.user,
                    endpoint,
                    mode,
                });
            set_result(&slot, parsed);
        });

        result
    }

    pub fn authorize_activation_task(
        &self,
        endpoint: &str,
        link_token: &str,
    ) -> ApiTask<ActivationAuthorization> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = json_request(
            "POST",
            format!(
                "{}/auth/activation/authorize",
                endpoint.trim_end_matches('/')
            ),
            Some(json!({ "token": link_token.trim() })),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ActivationAuthorization>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn set_activation_password_task(
        &self,
        endpoint: &str,
        activation_token: &str,
        password: &str,
        mode: StorageMode,
    ) -> ApiTask<Session> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let endpoint = endpoint.trim_end_matches('/').to_owned();
        let request = json_request(
            "POST",
            format!("{endpoint}/auth/activation/set-password"),
            Some(json!({
                "activationToken": activation_token,
                "password": password,
            })),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LoginResponse>)
                .map(|payload| Session {
                    token: payload.access_token,
                    session_id: payload.session_id,
                    user: payload.user,
                    endpoint,
                    mode,
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn health_task(&self, endpoint: &str) -> ApiTask<String> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = Request::get(format!("{}/health", endpoint.trim_end_matches('/')));

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(|response| {
                    if (200..300).contains(&response.status) {
                        Ok("Kết nối máy chủ thành công (200 OK)".to_string())
                    } else {
                        Err(format!("Máy chủ phản hồi mã lỗi: {}", response.status))
                    }
                });
            set_result(&slot, parsed);
        });

        result
    }

    pub fn change_password_task(
        &self,
        session: &Session,
        old_password: &str,
        new_password: &str,
        confirm_password: &str,
    ) -> ApiTask<String> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/auth/change-password",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "oldPassword": old_password,
                "newPassword": new_password,
                "confirmPassword": confirm_password,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ChangePasswordResponse>)
                .and_then(|payload| {
                    if payload.success {
                        Ok(payload.message)
                    } else {
                        Err(payload.message)
                    }
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_files_task(
        &self,
        session: &Session,
        parent_id: Option<&str>,
        employee_scope: bool,
    ) -> ApiTask<FileListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut url = format!("{}/files", session.endpoint.trim_end_matches('/'));
        let mut parameters = Vec::new();
        if let Some(parent_id) = parent_id {
            parameters.push(format!("parentId={parent_id}"));
        }
        if employee_scope {
            parameters.push("scope=employee".to_string());
        }
        if !parameters.is_empty() {
            url.push('?');
            url.push_str(&parameters.join("&"));
        }
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<FileListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_folder_task(
        &self,
        session: &Session,
        parent_id: &str,
        name: &str,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/files/folders", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "name": name,
                "parentId": parent_id,
                "originModule": "files",
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CreateFolderResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn upload_file_task(
        &self,
        session: &Session,
        parent_id: &str,
        file: &crate::file_transfer::PickedFile,
        origin_module: &str,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        if file.bytes.len() > crate::file_transfer::MAX_FILE_SIZE {
            set_result(&slot, Err("Tệp vượt quá giới hạn 50 MB.".to_owned()));
            return result;
        }
        let mut request = Request::post(
            format!("{}/files/upload", session.endpoint.trim_end_matches('/')),
            file.bytes.clone(),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Content-Type".to_string(), file.mime_type.clone());
        request
            .headers
            .insert("X-File-Name".to_string(), encode_path_segment(&file.name));
        request
            .headers
            .insert("X-Parent-Id".to_string(), parent_id.to_owned());
        request
            .headers
            .insert("X-Origin-Module".to_string(), origin_module.to_owned());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UploadFileResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_file_content_task(
        &self,
        session: &Session,
        file_id: &str,
        replacement: &crate::file_transfer::PickedFile,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        if replacement.bytes.len() > crate::file_transfer::MAX_FILE_SIZE {
            set_result(&slot, Err("Tệp vượt quá giới hạn 50 MB.".to_owned()));
            return result;
        }
        let mut request = Request::post(
            format!(
                "{}/files/{}/content",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(file_id)
            ),
            replacement.bytes.clone(),
        );
        request.method = "PUT".to_owned();
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Content-Type".to_string(), replacement.mime_type.clone());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<RenameFileResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn download_file_task(&self, session: &Session, file_id: &str) -> ApiTask<Vec<u8>> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/files/{}/download",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(file_id)
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_bytes_response);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn rename_file_task(
        &self,
        session: &Session,
        file_id: &str,
        name: &str,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/files/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(file_id)
            ),
            Some(json!({ "name": name })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<RenameFileResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_file_task(&self, session: &Session, file_id: &str) -> ApiTask<bool> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/files/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(file_id)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeleteFileResponse>)
                .map(|payload| payload.deleted);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_file_share_task(
        &self,
        session: &Session,
        file_id: &str,
    ) -> ApiTask<Option<FileShare>> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/files/{}/share",
            session.endpoint.trim_end_matches('/'),
            encode_path_segment(file_id)
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<FileShareLookupResponse>)
                .map(|payload| payload.share);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_file_share_task(
        &self,
        session: &Session,
        file_id: &str,
        is_active: bool,
    ) -> ApiTask<FileShare> {
        self.mutate_file_share_task(session, file_id, is_active, false, "POST")
    }

    pub fn update_file_share_task(
        &self,
        session: &Session,
        file_id: &str,
        is_active: bool,
        regenerate: bool,
    ) -> ApiTask<FileShare> {
        self.mutate_file_share_task(session, file_id, is_active, regenerate, "PATCH")
    }

    fn mutate_file_share_task(
        &self,
        session: &Session,
        file_id: &str,
        is_active: bool,
        regenerate: bool,
        method: &str,
    ) -> ApiTask<FileShare> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            method,
            format!(
                "{}/files/{}/share",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(file_id)
            ),
            Some(json!({ "isActive": is_active, "regenerate": regenerate })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<FileShareMutationResponse>)
                .map(|payload| payload.share);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn get_public_file_share_task(
        &self,
        api_endpoint: &str,
        token: &str,
    ) -> ApiTask<FileShare> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = Request::get(format!(
            "{}/files/share/{}",
            api_endpoint.trim_end_matches('/'),
            encode_path_segment(token)
        ));
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<PublicFileShareResponse>)
                .map(|payload| payload.share);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn download_public_file_share_task(
        &self,
        api_endpoint: &str,
        token: &str,
    ) -> ApiTask<Vec<u8>> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = Request::get(format!(
            "{}/files/share/{}/download",
            api_endpoint.trim_end_matches('/'),
            encode_path_segment(token)
        ));
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_bytes_response);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn poll<T>(task: &ApiTask<T>) -> Option<Result<T, String>> {
        task.lock().ok()?.take()
    }
}

fn json_request(method: &str, url: String, body: Option<Value>) -> Request {
    let body_bytes = body
        .map(|value| serde_json::to_vec(&value).unwrap_or_default())
        .unwrap_or_default();

    let mut request = Request::post(url, body_bytes);
    request.method = method.to_owned();
    request
        .headers
        .insert("Accept".to_string(), "application/json".to_string());
    if !request.body.is_empty() {
        request
            .headers
            .insert("Content-Type".to_string(), "application/json".to_string());
    }
    request
}

fn employee_contact_update_payload(phone: &str, address: &str) -> Value {
    json!({ "phone": phone, "address": address })
}

fn document_save_payload(title: &str, expected_revision: i64, snapshot: Value) -> Value {
    json!({
        "title": title,
        "expectedRevision": expected_revision,
        "snapshot": snapshot
    })
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn decode_response<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    if !(200..300).contains(&response.status) {
        let message = serde_json::from_slice::<Value>(&response.bytes)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .or_else(|| value.get("error"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| format!("Máy chủ phản hồi mã lỗi: {}", response.status));
        return Err(message);
    }

    serde_json::from_slice(&response.bytes)
        .map_err(|error| format!("Phản hồi API không hợp lệ: {error}"))
}

fn decode_bytes_response(response: Response) -> Result<Vec<u8>, String> {
    if !(200..300).contains(&response.status) {
        let message = serde_json::from_slice::<Value>(&response.bytes)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .or_else(|| value.get("error"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| format!("Máy chủ phản hồi mã lỗi: {}", response.status));
        return Err(message);
    }
    Ok(response.bytes)
}

fn set_result<T>(slot: &ApiTask<T>, result: Result<T, String>) {
    if let Ok(mut value) = slot.lock() {
        *value = Some(result);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ActivationAuthorization, ActivationEmailTemplateResponse, AssetMaintenance,
        AssetMaintenanceChecklistItem, AttendanceShiftAssignment,
        AttendanceShiftAssignmentsResponse, AttendanceShiftsResponse, AuditEventRecordedResponse,
        AuditLogsResponse, ChatChannelsResponse, ChatMessageMutationResponse, ChatMessagesResponse,
        ContractResponse, ContractsResponse, CreateAssetMaintenance,
        CreateAttendanceShiftAssignment, CreateEmployeeLeaveRequest, CreateEmployeeOvertimeRequest,
        CreateFinanceBankAccount, CreateFinanceBankTransfer, CreateFinanceCashTransaction,
        CreateHelpdeskIncidentInput, CreateHelpdeskTicketInput, CreateStrategicMilestoneInput,
        CreateStrategicOkrInput, CreateTaskBatchInput, CreateTaskInput, CreateTasksResponse,
        DashboardStats, DeleteFileResponse, DocumentCommentsResponse, DocumentHistoryResponse,
        DocumentMembersResponse, DocumentMutationResponse, DocumentShareResponse,
        EmployeeCreateResponse, EmployeeLeaveRequest, EmployeeListResponse,
        EmployeeOvertimeRequest, EmployeePayslip, EmployeePayslipsPagination,
        EmployeePayslipsResponse, EmployeeProposalInput, EmployeeProposalReviewInput,
        EmployeeProposalsResponse, EmployeeResponse, FileListResponse,
        FinanceBankAccountMutationResponse, FinanceBankAccountsResponse,
        FinanceBankTransferMutationResponse, FinanceCashMutationResponse,
        FinanceCashTransactionsResponse, HelpdeskIncident, HelpdeskIncidentDetailResponse,
        HelpdeskIncidentEvent, HelpdeskIncidentResponse, HelpdeskIncidentsResponse, HelpdeskTicket,
        HelpdeskTicketResponse, HelpdeskTicketsResponse, LeaveRequestRecord, LeaveRequestsResponse,
        LegacyAssetAllocationsImportPreview, LegacyAssetAllocationsImportResult,
        LegacyAssetDisposalsImportPreview, LegacyAssetDisposalsImportResult,
        LegacyAssetItemsImportPreview, LegacyAssetItemsImportResult,
        LegacyAssetMaintenancesImportPreview, LegacyAssetMaintenancesImportResult,
        LegacyAssetTransfersImportPreview, LegacyAssetTransfersImportResult,
        LegacyCrmContactsImportPreview, LegacyCrmContactsImportResult,
        LegacyCrmOperationsImportPreview, LegacyCrmOperationsImportResult,
        LegacyEmployeeBankImportPreview, LegacyEmployeeBankImportResult,
        LegacyEmployeeBankQuarantineResponse, LegacyEmployeeBankQuarantineReview,
        LegacyFinanceImportPreview, LegacyFinanceImportResult, LegacyHelpdeskIncidentImportPreview,
        LegacyHelpdeskIncidentImportResult, LegacyHelpdeskTicketImportPreview,
        LegacyHelpdeskTicketImportResult, LegacyPlanImportPreview, LegacyPlanImportResult,
        LegacyReportsCatalogImportPreview, LegacyReportsCatalogImportResult, MeetingBookingInput,
        MeetingRoomInput, MeetingRoomsResponse, OrgUnitsResponse, PerformAssetMaintenance,
        PlanProgressResponse, PlanReportWriteInput, PlanReportsResponse, PublicFileShareResponse,
        RenameFileResponse, ResolveHelpdeskIncidentInput, StrategicMilestonesResponse,
        StrategicOkrsResponse, SystemBroadcastInput, SystemBroadcastsResponse,
        TaskAssigneesResponse, TasksResponse, UpdatePlanProgressInput, UserNotificationsResponse,
        UsersPage, WorkflowBlueprintInput, WorkflowBlueprintsResponse, WorkflowCollectionResponse,
        WorkflowRequestDecisionInput, WorkflowRequestInput, WorkflowRequestsResponse,
        WorkflowSettingsResponse, encode_path_segment, json_request,
    };
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn finance_cash_contract_preserves_legacy_wire_names_and_server_generated_identity() {
        let payload = json!({
            "data": [{
                "key": "cash-1", "code": "PT-20261008-A1B2C3D4", "type": "Thu",
                "source": "bank", "category": "Thanh toán hợp đồng", "amount": 240000000,
                "date": "2026-10-08", "recipientOrPayer": "Alpha Tech",
                "account": "Tài khoản 01", "status": "Đã hoàn thành", "note": "Hợp đồng",
                "department": "Tài chính", "employeeCode": "EMP-007",
                "createdAt": "2026-10-08T10:00:00Z", "updatedAt": "2026-10-08T10:00:00Z"
            }]
        });
        let list: FinanceCashTransactionsResponse =
            serde_json::from_value(payload.clone()).expect("finance cash list response");
        assert_eq!(list.data[0].transaction_type, "Thu");
        assert_eq!(list.data[0].recipient_or_payer, "Alpha Tech");
        assert_eq!(list.data[0].amount, 240000000);

        let mutation: FinanceCashMutationResponse = serde_json::from_value(json!({
            "transaction": payload["data"][0].clone()
        }))
        .expect("finance cash mutation response");
        assert_eq!(mutation.transaction.code, "PT-20261008-A1B2C3D4");

        let create = CreateFinanceCashTransaction {
            code: None,
            transaction_type: "Chi".to_owned(),
            source: "petty".to_owned(),
            category: "Văn phòng phẩm".to_owned(),
            amount: 1_250_000,
            date: "2026-10-08".to_owned(),
            recipient_or_payer: "Nhà cung cấp".to_owned(),
            account: "Quỹ tiền mặt".to_owned(),
            status: "Chờ duyệt".to_owned(),
            note: String::new(),
            department: Some("Hành chính".to_owned()),
            employee_code: None,
        };
        let serialized = serde_json::to_value(create).expect("finance cash create payload");
        assert_eq!(serialized["type"], "Chi");
        assert_eq!(serialized["recipientOrPayer"], "Nhà cung cấp");
        assert_eq!(serialized["amount"], 1_250_000);
        assert!(serialized.get("code").is_none());
        assert!(serialized.get("createdBy").is_none());
    }

    #[test]
    fn finance_bank_account_contract_keeps_legacy_fields_and_serializes_create_payload() {
        let list: FinanceBankAccountsResponse = serde_json::from_value(json!({
            "data": [{
                "key": "bank-1", "bankName": "Ngân hàng thử nghiệm",
                "accountNumber": "0123456789", "accountHolder": "NGUYEN VAN A",
                "branch": "Chi nhánh Hà Nội", "balance": 1250000,
                "status": "Đang hoạt động", "createdAt": "2026-10-08T10:00:00Z",
                "updatedAt": "2026-10-08T10:00:00Z"
            }]
        }))
        .expect("finance bank account list response");
        assert_eq!(list.data[0].account_number, "0123456789");
        assert_eq!(list.data[0].balance, 1_250_000);

        let mutation: FinanceBankAccountMutationResponse = serde_json::from_value(json!({
            "account": {
                "key": "bank-1", "bankName": "Ngân hàng thử nghiệm",
                "accountNumber": "0123456789", "accountHolder": "NGUYEN VAN A",
                "branch": "", "balance": 0, "status": "Đang hoạt động",
                "createdAt": "2026-10-08T10:00:00Z", "updatedAt": "2026-10-08T10:00:00Z"
            }
        }))
        .expect("finance bank account mutation response");
        assert_eq!(mutation.account.key, "bank-1");

        let create = CreateFinanceBankAccount {
            bank_name: "Ngân hàng thử nghiệm".to_owned(),
            account_number: "0123456789".to_owned(),
            account_holder: "NGUYEN VAN A".to_owned(),
            branch: String::new(),
            balance: 0,
            status: "Đang hoạt động".to_owned(),
        };
        let serialized = serde_json::to_value(create).expect("create bank account payload");
        assert_eq!(serialized["bankName"], "Ngân hàng thử nghiệm");
        assert_eq!(serialized["accountNumber"], "0123456789");
        assert_eq!(serialized["balance"], 0);
        assert!(serialized.get("createdBy").is_none());
        assert!(serialized.get("key").is_none());
    }

    #[test]
    fn finance_bank_transfer_contract_preserves_linked_legacy_vouchers_and_retry_state() {
        let mutation: FinanceBankTransferMutationResponse = serde_json::from_value(json!({
            "transfer": {
                "key": "transfer-1",
                "fromAccountKey": "bank-a",
                "toAccountKey": "bank-b",
                "amount": 250000,
                "note": "Điều chuyển hợp đồng",
                "date": "2026-10-09",
                "replayed": true,
                "debit": {
                    "key": "debit-1", "code": "PC-20261009-1", "type": "Chi",
                    "source": "bank", "category": "Chuyển tiền nội bộ", "amount": 250000,
                    "date": "2026-10-09", "recipientOrPayer": "Ngân hàng B",
                    "account": "Ngân hàng A", "status": "Đã hoàn thành",
                    "note": "Chuyển sang Ngân hàng B: Điều chuyển hợp đồng",
                    "department": "", "employeeCode": "",
                    "createdAt": "2026-10-09T00:00:00Z", "updatedAt": "2026-10-09T00:00:00Z"
                },
                "credit": {
                    "key": "credit-1", "code": "PT-20261009-1", "type": "Thu",
                    "source": "bank", "category": "Chuyển tiền nội bộ", "amount": 250000,
                    "date": "2026-10-09", "recipientOrPayer": "Ngân hàng A",
                    "account": "Ngân hàng B", "status": "Đã hoàn thành",
                    "note": "Nhận từ Ngân hàng A: Điều chuyển hợp đồng",
                    "department": "", "employeeCode": "",
                    "createdAt": "2026-10-09T00:00:00Z", "updatedAt": "2026-10-09T00:00:00Z"
                }
            }
        }))
        .expect("linked finance bank transfer response");
        assert_eq!(mutation.transfer.debit.transaction_type, "Chi");
        assert_eq!(mutation.transfer.credit.transaction_type, "Thu");
        assert!(mutation.transfer.replayed);

        let create = CreateFinanceBankTransfer {
            idempotency_key: "retry-key-1".to_owned(),
            from_account_key: "bank-a".to_owned(),
            to_account_key: "bank-b".to_owned(),
            amount: 250_000,
            note: "Điều chuyển hợp đồng".to_owned(),
        };
        let serialized = serde_json::to_value(create).expect("bank transfer create payload");
        assert_eq!(serialized["idempotencyKey"], "retry-key-1");
        assert_eq!(serialized["fromAccountKey"], "bank-a");
        assert_eq!(serialized["amount"], 250_000);
    }

    #[test]
    fn chat_responses_decode_server_camel_case_and_pagination_contract() {
        let channels: ChatChannelsResponse = serde_json::from_value(json!({
            "data": [{
                "id": "channel-1", "type": "COMPANY", "visibility": "PUBLIC",
                "name": "chung", "status": "ACTIVE", "kind": "TEXT",
                "category": "KÊNH VĂN BẢN", "topic": "Thảo luận", "locked": false,
                "unreadCount": 2, "lastMessage": null
            }]
        }))
        .expect("chat channel response");
        assert_eq!(channels.data[0].channel_type, "COMPANY");
        assert_eq!(channels.data[0].unread_count, 2);

        let message_payload = json!({
            "data": [{
                "id": "message-1", "channelId": "channel-1", "userId": "user-1",
                "content": "Xin chào", "replyToId": null, "attachments": [],
                "createdAt": "2026-10-08T10:00:00Z", "updatedAt": "2026-10-08T10:00:00Z",
                "editedAt": null, "recalledAt": null, "deletedAt": null,
                "user": {
                    "id": "user-1", "email": "user@example.test",
                    "profile": {"fullName": "Người dùng", "avatarUrl": "", "title": ""},
                    "employee": {"title": "", "department": {"name": "Kỹ thuật"}}
                },
                "reactions": [{
                    "id": "reaction-1", "messageId": "message-1", "userId": "user-2",
                    "emoji": "👍", "createdAt": "2026-10-08T10:01:00Z"
                }]
            }],
            "pagination": {"hasMore": true, "nextCursor": "message-1"}
        });
        let messages: ChatMessagesResponse =
            serde_json::from_value(message_payload.clone()).expect("chat messages response");
        assert_eq!(messages.data[0].reply_to_id, None);
        assert_eq!(messages.data[0].reactions[0].emoji, "👍");
        assert!(messages.pagination.has_more);
        assert_eq!(
            messages.pagination.next_cursor.as_deref(),
            Some("message-1")
        );

        let mutation: ChatMessageMutationResponse = serde_json::from_value(json!({
            "success": true,
            "data": message_payload["data"][0].clone()
        }))
        .expect("chat message mutation response");
        assert!(mutation.success);
        assert_eq!(mutation.data.id, "message-1");
    }

    #[test]
    fn document_collaboration_responses_decode_legacy_wire_shapes() {
        let comments: DocumentCommentsResponse = serde_json::from_value(json!({
            "comments": [{
                "id": "comment-1", "documentId": "doc-1", "authorId": "user-1",
                "authorName": "Người dùng", "authorCode": "EMP-001", "anchor": {"blockId": "p1"},
                "body": "Xem lại", "resolved": false, "createdAt": "2026-10-08", "updatedAt": "2026-10-08"
            }]
        })).expect("document comments response");
        assert_eq!(comments.comments[0].body, "Xem lại");
        assert_eq!(comments.comments[0].anchor["blockId"], "p1");

        let members: DocumentMembersResponse = serde_json::from_value(json!({
            "members": [{
                "id": "member-1", "role": "commenter", "created_at": "2026-10-08",
                "user_id": "user-1", "name": "Người dùng", "email": "user@example.test", "employee_code": "EMP-001"
            }]
        })).expect("document members legacy snake-case fields");
        assert_eq!(members.members[0].employee_code, "EMP-001");

        let history: DocumentHistoryResponse = serde_json::from_value(json!({
            "history": [
                {"id": "snapshot-2", "revision": 2, "created_at": "2026-10-08T10:00:00Z"},
                {"id": "snapshot-1", "revision": 1, "created_at": "2026-10-08T09:00:00Z"}
            ]
        }))
        .expect("document history legacy snake-case fields");
        assert_eq!(history.history[0].revision, 2);
        assert_eq!(history.history[1].id, "snapshot-1");

        let shared: DocumentShareResponse = serde_json::from_value(json!({
            "success": true,
            "member": {"userId": "user-1", "name": "Người dùng", "email": "user@example.test", "role": "viewer"}
        })).expect("document share response");
        assert!(shared.success);
        assert_eq!(shared.member.role, "viewer");

        let saved: DocumentMutationResponse = serde_json::from_value(json!({
            "document": {
                "id": "doc-1", "title": "Saved", "ownerId": "owner-1", "ownerName": "Owner",
                "ownerCode": "", "currentRevision": 2, "settings": {}, "userRole": "owner",
                "createdAt": "2026-10-08", "updatedAt": "2026-10-08"
            },
            "snapshotSaved": true,
            "revision": 2
        }))
        .expect("atomic document save response");
        assert!(saved.snapshot_saved);
        assert_eq!(saved.document.current_revision, 2);
    }

    #[test]
    fn document_save_request_includes_optimistic_revision_in_legacy_camel_case() {
        let payload = super::document_save_payload("Biên bản", 7, json!({"blocks": []}));
        assert_eq!(payload["expectedRevision"], 7);
        assert_eq!(payload["title"], "Biên bản");
        assert_eq!(payload["snapshot"]["blocks"], json!([]));
        assert!(payload.get("expected_revision").is_none());
    }

    #[test]
    fn task_assignee_contract_decodes_scoped_projects_and_legacy_response_shape() {
        let response: TaskAssigneesResponse = serde_json::from_value(json!({
            "data":[{
                "id":"employee-1",
                "name":"Employee One",
                "employeeCode":"EMP-001",
                "department":"Operations",
                "position":"Engineer",
                "role":"USER"
            }],
            "projects":[{"name":"Operations","assigneeIds":["employee-1"]}]
        }))
        .expect("scoped task assignee response");
        assert_eq!(response.data[0].id, "employee-1");
        assert_eq!(response.projects[0].name, "Operations");
        assert_eq!(response.projects[0].assignee_ids.len(), 1);
        assert_eq!(response.projects[0].assignee_ids[0], "employee-1");

        let legacy_shape: TaskAssigneesResponse = serde_json::from_value(json!({"data":[]}))
            .expect("backward-compatible task assignee response");
        assert!(legacy_shape.projects.is_empty());
    }

    #[test]
    fn task_batch_contract_uses_assignee_ids_and_decodes_atomic_result() {
        let input = CreateTaskBatchInput {
            task_title: "Chuẩn hóa tài liệu".to_owned(),
            description: "Hoàn tất hướng dẫn".to_owned(),
            project_name: "Operations".to_owned(),
            assignee_ids: vec!["employee-1".to_owned(), "employee-2".to_owned()],
            priority: "Cao".to_owned(),
            due_date: "2026-10-15".to_owned(),
            checklist: vec!["Rà soát".to_owned()],
        };
        let payload = serde_json::to_value(input).expect("batch task request JSON");
        assert_eq!(payload["assigneeIds"], json!(["employee-1", "employee-2"]));
        assert!(payload.get("assigneeId").is_none());

        let result: CreateTasksResponse = serde_json::from_value(json!({"tasks": [], "count": 0}))
            .expect("atomic batch task result");
        assert!(result.tasks.is_empty());
        assert_eq!(result.count, 0);
    }

    #[test]
    fn meeting_room_contract_preserves_legacy_wire_fields_and_booker() {
        let payload = r#"{"rooms":[{"key":"room-1","name":"Phòng Tokyo","location":"Tầng 3","capacity":10,"equipment":["Polycom"],"status":"Trống","legacyNote":"Giữ dữ liệu cũ"}],"bookings":[{"key":"booking-1","roomName":"Phòng Tokyo","meetingTitle":"Kế hoạch quý","booker":"Admin","date":"2026-12-01","timeSlot":"09:00 - 10:00","participantsCount":8,"status":"Đã xác nhận"}]}"#;
        let response: MeetingRoomsResponse =
            serde_json::from_str(payload).expect("meeting rooms response");
        assert_eq!(response.rooms[0].name, "Phòng Tokyo");
        assert_eq!(response.bookings[0].participants_count, 8);

        let room = MeetingRoomInput {
            name: "Phòng Tokyo".to_owned(),
            location: "Tầng 3".to_owned(),
            capacity: 10,
            equipment: vec!["Polycom".to_owned()],
        };
        let encoded_room = serde_json::to_value(room).expect("room create JSON");
        assert_eq!(encoded_room["capacity"], 10);
        assert_eq!(encoded_room["equipment"][0], "Polycom");

        let booking = MeetingBookingInput {
            room_name: "Phòng Tokyo".to_owned(),
            meeting_title: "Kế hoạch quý".to_owned(),
            booker: "Nguyễn An".to_owned(),
            date: "2026-12-01".to_owned(),
            time_slot: "09:00 - 10:00".to_owned(),
            participants_count: 8,
        };
        let encoded_booking = serde_json::to_value(booking).expect("booking create JSON");
        assert_eq!(encoded_booking["roomName"], "Phòng Tokyo");
        assert_eq!(encoded_booking["participantsCount"], 8);
        assert_eq!(encoded_booking["booker"], "Nguyễn An");
    }

    #[test]
    fn workflow_blueprint_contract_uses_legacy_camel_case_fields() {
        let payload = r#"{"data":[{"key":"WF-BP-1","workflowCode":"WF-CUSTOM-01","workflowName":"Đề xuất mua sắm","category":"Mua sắm & Tài sản","description":"Mô tả","scope":"Toàn công ty","totalSteps":2,"slaTargetHours":8,"applicableBudgetLimit":100000000,"approvalFlow":[{"level":1,"roleName":"Trưởng bộ phận phê duyệt","defaultApprover":"Cán bộ phụ trách","slaHours":4,"canReject":true,"requireTokenPKI":false}],"formFields":[{"fieldName":"title","label":"Tiêu đề đề xuất","type":"Văn bản","required":true}],"activeInstancesCount":0,"totalCompletedCount":0,"passRate":0.0,"status":"Đang áp dụng","version":"v1.0","createdBy":"Admin","extraLegacyField":"preserved by server"}]}"#;
        let response: WorkflowBlueprintsResponse =
            serde_json::from_str(payload).expect("workflow blueprint response");
        let item = &response.data[0];
        assert_eq!(item.workflow_code, "WF-CUSTOM-01");
        assert_eq!(item.approval_flow[0].require_token_pki, false);
        assert_eq!(item.form_fields[0].field_type, "Văn bản");

        let input = WorkflowBlueprintInput {
            workflow_code: "WF-CUSTOM-01".to_owned(),
            workflow_name: "Đề xuất mua sắm".to_owned(),
            category: "Mua sắm & Tài sản".to_owned(),
            description: "Mô tả".to_owned(),
            scope: "Toàn công ty".to_owned(),
            total_steps: 2,
            sla_target_hours: 8,
            applicable_budget_limit: 100_000_000,
            version: "v1.0".to_owned(),
        };
        let encoded = serde_json::to_value(input).expect("workflow create JSON");
        assert_eq!(encoded["workflowCode"], "WF-CUSTOM-01");
        assert_eq!(encoded["totalSteps"], 2);
        assert_eq!(encoded["applicableBudgetLimit"], 100_000_000_u64);
    }

    #[test]
    fn workflow_request_contract_decodes_server_history_and_uses_camel_case() {
        let payload = r#"{"data":[{"key":"WF-REQ-1","code":"WF-2026-0001","workflowName":"Mua sắm","workflowCode":"WF-PURCHASE","category":"Mua sắm & Tài sản","requester":"Nguyễn An","department":"Vận hành","currentLevel":1,"totalLevels":2,"roleRequirement":"Quản lý","budgetAmount":1250000,"submittedAt":"2026-10-08T00:00:00Z","slaDeadline":"2026-10-08T08:00:00Z","slaHoursLeft":8.0,"priority":"Bình thường (P3)","status":"Chờ duyệt","summaryDetails":"Mua thiết bị","tokenRequired":false,"attachments":[],"approvalNotes":null,"createdByUserId":"admin-1","createdByName":"Admin","approvalHistory":[{"action":"submitted"}],"pkiIntegrationAvailable":false}]}"#;
        let response: WorkflowRequestsResponse =
            serde_json::from_str(payload).expect("workflow request response");
        let request = &response.data[0];
        assert_eq!(request.workflow_code, "WF-PURCHASE");
        assert_eq!(request.budget_amount, 1_250_000);
        assert_eq!(request.approval_history.len(), 1);
        assert!(request.attachments.is_empty());
        assert!(!request.pki_integration_available);

        let input = WorkflowRequestInput {
            code: "WF-2026-0001".to_owned(),
            workflow_code: "WF-PURCHASE".to_owned(),
            workflow_name: "Đề xuất mua thiết bị".to_owned(),
            requester: "Nguyễn An".to_owned(),
            department: "Vận hành".to_owned(),
            summary_details: "Mua thiết bị".to_owned(),
            budget_amount: 1_250_000,
            priority: "Bình thường (P3)".to_owned(),
        };
        let encoded = serde_json::to_value(input).expect("workflow request input JSON");
        assert_eq!(encoded["workflowCode"], "WF-PURCHASE");
        assert_eq!(encoded["workflowName"], "Đề xuất mua thiết bị");
        assert_eq!(encoded["summaryDetails"], "Mua thiết bị");
        assert_eq!(encoded["budgetAmount"], 1_250_000_u64);
        assert!(encoded.get("summary_details").is_none());

        let decision = WorkflowRequestDecisionInput {
            action: "approve".to_owned(),
            note: Some("Đã kiểm tra".to_owned()),
        };
        let encoded = serde_json::to_value(decision).expect("workflow decision input JSON");
        assert_eq!(encoded["action"], "approve");
        assert_eq!(encoded["note"], "Đã kiểm tra");
    }

    #[test]
    fn workflow_collection_contract_keeps_legacy_json_records() {
        let payload = r#"{"data":[{"key":"workflow-1","code":"WF-1","title":"Mua thiết bị","requester":"Nguyễn An","department":"Vận hành","step":"Trưởng bộ phận","currentApprover":"Trưởng phòng","submittedDate":"2026-10-09","status":"Đang xử lý","legacyField":"retained"}]}"#;
        let response: WorkflowCollectionResponse =
            serde_json::from_str(payload).expect("legacy workflow collection");
        let item = &response.data[0];
        assert_eq!(item["code"], "WF-1");
        assert_eq!(item["submittedDate"], "2026-10-09");
        assert_eq!(item["legacyField"], "retained");
    }

    #[test]
    fn employee_proposal_contract_preserves_legacy_fields_and_request_shapes() {
        let payload = r#"{"data":[{"key":"proposal-1","code":"KNG-20261008-A1B2C3D4","title":"Cải tiến tiếp nhận","type":"Cải tiến quy trình","amount":1250000,"content":"Chuẩn hóa luồng tiếp nhận.","submitterId":"user-1","employeeName":"Nguyễn An","employeeCode":"NV-1001","status":"Chờ duyệt","approver":"","reviewNote":"","reviewedAt":"","date":"2026-10-08","createdAt":"2026-10-08T09:00:00Z","updatedAt":"2026-10-08T09:00:00Z"}]}"#;
        let response: EmployeeProposalsResponse =
            serde_json::from_str(payload).expect("employee proposal list");
        assert_eq!(response.data[0].proposal_type, "Cải tiến quy trình");
        assert_eq!(response.data[0].submitter_id, "user-1");
        assert_eq!(response.data[0].amount, 1_250_000);

        let input = EmployeeProposalInput {
            title: "Cải tiến tiếp nhận".to_owned(),
            proposal_type: "Cải tiến quy trình".to_owned(),
            amount: 1_250_000,
            content: "Chuẩn hóa luồng tiếp nhận.".to_owned(),
        };
        let encoded = serde_json::to_value(input).expect("proposal create JSON");
        assert_eq!(encoded["type"], "Cải tiến quy trình");
        assert_eq!(encoded["amount"], 1_250_000);
        assert!(encoded.get("proposalType").is_none());

        let review = EmployeeProposalReviewInput {
            status: "Đã duyệt".to_owned(),
            review_note: "Đồng ý triển khai thử nghiệm.".to_owned(),
        };
        let encoded = serde_json::to_value(review).expect("proposal review JSON");
        assert_eq!(encoded["status"], "Đã duyệt");
        assert_eq!(encoded["reviewNote"], "Đồng ý triển khai thử nghiệm.");
    }

    #[test]
    fn strategic_milestone_contract_preserves_legacy_fields_and_camel_case() {
        let payload = r#"{"data":[{"key":"m-1","code":"MLS-Q4-01","quarter":"Q4/2026","name":"Kiểm thử tải","acceptanceCriteria":"50.000 CCU","owner":"Khối Kỹ thuật","deadline":"2026-12-31","progress":0,"status":"Đang thực hiện"}]}"#;
        let response: StrategicMilestonesResponse =
            serde_json::from_str(payload).expect("strategic milestone list");
        let milestone = &response.data[0];
        assert_eq!(milestone.quarter, "Q4/2026");
        assert_eq!(milestone.acceptance_criteria, "50.000 CCU");
        assert_eq!(milestone.progress, 0);

        let input = CreateStrategicMilestoneInput {
            code: "MLS-Q4-01".to_owned(),
            quarter: "Q4/2026".to_owned(),
            name: "Kiểm thử tải".to_owned(),
            acceptance_criteria: "50.000 CCU".to_owned(),
            owner: "Khối Kỹ thuật".to_owned(),
            deadline: "2026-12-31".to_owned(),
        };
        let encoded = serde_json::to_value(input).expect("milestone create JSON");
        assert_eq!(encoded["acceptanceCriteria"], "50.000 CCU");
        assert_eq!(encoded["deadline"], "2026-12-31");
        assert!(encoded.get("acceptance_criteria").is_none());
    }

    #[test]
    fn plan_progress_contract_preserves_legacy_fields_and_update_shape() {
        let payload = r#"{"data":[{"key":"progress-1","code":"TASK-P-01","planName":"Nâng cấp nền tảng","taskTitle":"Tối ưu truy vấn","assignee":"Nguyễn An","dueDate":"2026-12-20","daysRemaining":10,"progressPercent":65,"weightPercent":25,"status":"Đúng tiến độ"}]}"#;
        let response: PlanProgressResponse =
            serde_json::from_str(payload).expect("plan progress response");
        let entry = &response.data[0];
        assert_eq!(entry.plan_name, "Nâng cấp nền tảng");
        assert_eq!(entry.days_remaining, 10);
        assert_eq!(entry.weight_percent, 25);

        let input = UpdatePlanProgressInput {
            progress_percent: 100,
        };
        let encoded = serde_json::to_value(input).expect("plan progress update JSON");
        assert_eq!(encoded["progressPercent"], 100);
        assert!(encoded.get("progress_percent").is_none());
    }

    #[test]
    fn plan_report_contract_uses_camel_case_and_persisted_evaluation_fields() {
        let payload = r#"{"data":[{"key":"report-1","period":"Q3/2026","department":"Khối Kỹ thuật","leader":"Nguyễn An","totalPlans":4,"completedPlans":3,"approvedBudget":1000000000,"actualSpent":950000000,"variance":-50000000,"kpiScore":96.5,"evaluation":"Xuất sắc","projects":[{"code":"legacy-project"}],"createdByUserId":"admin-1","createdByName":"Admin","createdAt":"2026-10-08T00:00:00Z","updatedByUserId":"admin-1","updatedByName":"Admin","updatedAt":"2026-10-08T00:00:00Z"}]}"#;
        let response: PlanReportsResponse =
            serde_json::from_str(payload).expect("plan reports response");
        let report = &response.data[0];
        assert_eq!(report.period, "Q3/2026");
        assert_eq!(report.variance, -50_000_000);
        assert_eq!(report.kpi_score, 96.5);

        let input = PlanReportWriteInput {
            period: "Q3/2026".to_owned(),
            department: "Khối Kỹ thuật".to_owned(),
            leader: "Nguyễn An".to_owned(),
            total_plans: 4,
            completed_plans: 3,
            approved_budget: 1_000_000_000,
            actual_spent: 950_000_000,
            kpi_score: 96.5,
        };
        let encoded = serde_json::to_value(input).expect("plan report input JSON");
        assert_eq!(encoded["actualSpent"], 950_000_000);
        assert_eq!(encoded["kpiScore"], 96.5);
        assert!(encoded.get("actual_spent").is_none());
    }

    #[test]
    fn strategic_okr_contract_preserves_legacy_camel_case_and_fractional_progress() {
        let payload = r#"{"data":[{"key":"okr-1","okrCode":"OKR-2026-01","title":"Mở rộng IDC","pillar":"Hạ tầng Công nghệ & AI","owner":"Nguyễn An","targetMetric":"12 rack","progressPct":27.5,"deadline":"2026-12-31","status":"Đang đúng tiến độ"}]}"#;
        let response: StrategicOkrsResponse =
            serde_json::from_str(payload).expect("strategic OKR response");
        let okr = &response.data[0];
        assert_eq!(okr.okr_code, "OKR-2026-01");
        assert_eq!(okr.progress_pct, 27.5);

        let input = CreateStrategicOkrInput {
            okr_code: "OKR-2026-02".to_owned(),
            title: "Tăng trưởng".to_owned(),
            pillar: "Tăng trưởng Doanh thu".to_owned(),
            owner: "Nguyễn An".to_owned(),
            target_metric: "ARR".to_owned(),
            progress_pct: 0.0,
            deadline: "2026-12-31".to_owned(),
        };
        let encoded = serde_json::to_value(input).expect("strategic OKR input JSON");
        assert_eq!(encoded["okrCode"], "OKR-2026-02");
        assert_eq!(encoded["progressPct"], 0.0);
        assert!(encoded.get("okr_code").is_none());
    }

    #[test]
    fn legacy_plan_import_contract_reads_preview_and_atomic_result() {
        let preview: LegacyPlanImportPreview = serde_json::from_value(json!({
            "batchId":"a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "totalRecords":3,
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP 3 a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "canApply":true,
            "collections":[{"scope":"plan_okrs","sourceRecords":3,"targetRecords":0}]
        }))
        .expect("legacy import preview contract");
        assert_eq!(preview.total_records, 3);
        assert_eq!(preview.collections[0].scope, "plan_okrs");
        assert!(preview.can_apply);

        let imported: LegacyPlanImportResult = serde_json::from_value(json!({
            "batchId":"a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "importedRecords":3,
            "importedAt":"2026-10-08T00:00:00Z",
            "collections":[{"scope":"plan_okrs","sourceRecords":3,"targetRecords":0}]
        }))
        .expect("legacy import result contract");
        assert_eq!(imported.imported_records, 3);
    }

    #[test]
    fn legacy_crm_import_contract_contains_only_summary_metadata() {
        let preview: LegacyCrmOperationsImportPreview = serde_json::from_value(json!({
            "batchId":"a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-CRM-A82C8760-2",
            "sourceRecords":2,
            "importableRecords":2,
            "alreadyImportedRecords":0,
            "conflictedRecords":0,
            "supplierEvaluationRecords":1,
            "customerFeedbackRecords":1,
            "canApply":true
        }))
        .expect("CRM import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.supplier_evaluation_records, 1);
        assert_eq!(preview.customer_feedback_records, 1);
        assert!(preview.can_apply);

        let imported: LegacyCrmOperationsImportResult = serde_json::from_value(json!({
            "batchId":"a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "importedRecords":2,
            "alreadyImportedRecords":0,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("CRM import result contract");
        assert_eq!(imported.imported_records, 2);
    }

    #[test]
    fn legacy_crm_contacts_import_contract_contains_summary_and_source_identity_only() {
        let preview: LegacyCrmContactsImportPreview = serde_json::from_value(json!({
            "batchId":"f2c03560-587e-4881-b342-f09be4e1b123",
            "sourceDatabaseId":"legacy-fixture-v1",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-CRM-CONTACTS-F2C03560-2",
            "sourceRecords":2,
            "importableRecords":2,
            "alreadyImportedRecords":0,
            "conflictedRecords":0,
            "customerRecords":1,
            "supplierRecords":1,
            "partnerRecords":0,
            "canApply":true
        }))
        .expect("CRM contacts preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.customer_records, 1);
        assert_eq!(preview.supplier_records, 1);
        assert!(preview.can_apply);

        let imported: LegacyCrmContactsImportResult = serde_json::from_value(json!({
            "batchId":"f2c03560-587e-4881-b342-f09be4e1b123",
            "importedRecords":2,
            "alreadyImportedRecords":0,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("CRM contacts import result contract");
        assert_eq!(imported.imported_records, 2);
    }

    #[test]
    fn legacy_finance_import_contract_contains_only_summary_counts() {
        let preview: LegacyFinanceImportPreview = serde_json::from_value(json!({
            "batchId":"2b58037d-41c8-4fca-95bf-5a75fb02dc1a",
            "sourceDatabaseId":"approved-copy-v1",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-FINANCE-2B58037D-3",
            "sourceRecords":3,
            "importableRecords":2,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "accountRecords":1,
            "cashTransactionRecords":2,
            "importableAccounts":1,
            "alreadyImportedAccounts":0,
            "conflictedAccounts":0,
            "importableCashTransactions":1,
            "alreadyImportedCashTransactions":1,
            "conflictedCashTransactions":0,
            "canApply":true
        }))
        .expect("finance import preview contract");
        assert_eq!(preview.source_records, 3);
        assert_eq!(preview.account_records, 1);
        assert_eq!(preview.cash_transaction_records, 2);
        assert!(preview.can_apply);

        let imported: LegacyFinanceImportResult = serde_json::from_value(json!({
            "batchId":"2b58037d-41c8-4fca-95bf-5a75fb02dc1a",
            "sourceRecords":3,
            "importedRecords":2,
            "alreadyImportedRecords":1,
            "importedAccounts":1,
            "importedCashTransactions":1,
            "importedAt":"2026-10-09T00:00:00Z"
        }))
        .expect("finance import result contract");
        assert_eq!(imported.imported_accounts, 1);
        assert_eq!(imported.imported_cash_transactions, 1);
    }

    #[test]
    fn helpdesk_ticket_contract_uses_server_owned_identity_and_legacy_wire_names() {
        let input = CreateHelpdeskTicketInput {
            title: "Network issue".to_owned(),
            requester: "Fixture requester".to_owned(),
            department: "IT".to_owned(),
            priority: "Cao".to_owned(),
        };
        let payload = serde_json::to_value(input).expect("ticket create payload");
        assert_eq!(payload["requester"], "Fixture requester");
        assert!(payload.get("code").is_none());
        assert!(payload.get("status").is_none());
        assert!(payload.get("createdBy").is_none());

        let response: HelpdeskTicketResponse = serde_json::from_value(json!({
            "ticket": {
                "key":"ticket-1", "code":"TK-20261008-AB12CD34", "title":"Network issue",
                "requester":"Fixture requester", "department":"IT", "priority":"Cao",
                "status":"Mới tạo", "createdDate":"2026-10-08T00:00:00Z",
                "createdBy":"admin-1", "createdByName":"Admin", "updatedAt":"2026-10-08T00:00:00Z"
            }
        }))
        .expect("ticket response contract");
        assert_eq!(response.ticket.created_by, "admin-1");
        let list: HelpdeskTicketsResponse =
            serde_json::from_value(json!({"data":[response.ticket]}))
                .expect("ticket list contract");
        let ticket: &HelpdeskTicket = &list.data[0];
        assert_eq!(ticket.status, "Mới tạo");

        let imported: HelpdeskTicket = serde_json::from_value(json!({
            "key":"legacy-ticket-1", "code":"TK-OLD-1", "title":"Old ticket",
            "requester":"Legacy requester", "department":"IT", "priority":"Cao",
            "status":"Đang xử lý", "createdDate":"2025-03-04 09:10",
            "createdBy":"admin-1", "createdByName":"Admin", "updatedAt":"2025-03-04 09:10",
            "legacyImportStatus":"unverified"
        }))
        .expect("legacy ticket response");
        assert_eq!(imported.legacy_import_status.as_deref(), Some("unverified"));
    }

    #[test]
    fn helpdesk_incident_contract_does_not_claim_fake_metrics_or_rca_state() {
        let input = CreateHelpdeskIncidentInput {
            incident_title: "Auth outage".to_owned(),
            affected_system: "Identity service".to_owned(),
            severity: "P1 - Khẩn cấp (Toàn hệ thống)".to_owned(),
            handler: "On-call lead".to_owned(),
            root_cause: Some("Preliminary analysis".to_owned()),
        };
        let payload = serde_json::to_value(input).expect("incident create payload");
        assert!(payload.get("code").is_none());
        assert!(payload.get("status").is_none());
        assert!(payload.get("timeline").is_none());
        assert!(payload.get("actionItems").is_none());
        assert!(payload.get("downtimeMinutes").is_none());

        let detail: HelpdeskIncidentDetailResponse = serde_json::from_value(json!({
            "incident": {
                "key":"incident-1", "code":"INC-20261008-AB12CD34",
                "incidentTitle":"Auth outage", "affectedSystem":"Identity service",
                "severity":"P1 - Khẩn cấp (Toàn hệ thống)",
                "occurredAt":"2026-10-08T00:00:00Z", "resolvedAt":null,
                "handler":"On-call lead", "rootCause":"Preliminary analysis",
                "status":"Đang xử lý", "createdBy":"admin-1",
                "createdByName":"Admin", "updatedAt":"2026-10-08T00:00:00Z",
                "legacyImportStatus":"unverified"
            },
            "events":[{
                "eventType":"created", "actorId":"admin-1", "actorName":"Admin",
                "fromStatus":null, "toStatus":"Đang xử lý", "note":"Hồ sơ sự cố được ghi nhận.",
                "createdAt":"2026-10-08T00:00:00Z"
            }]
        }))
        .expect("incident detail contract");
        assert_eq!(detail.incident.status, "Đang xử lý");
        assert_eq!(detail.events.len(), 1);
        assert_eq!(detail.events[0].actor_name, "Admin");
        assert_eq!(
            detail.incident.legacy_import_status.as_deref(),
            Some("unverified")
        );

        let event: HelpdeskIncidentEvent = serde_json::from_value(json!({
            "eventType":"resolved", "actorId":"admin-1", "actorName":"Admin",
            "fromStatus":"Đang xử lý", "toStatus":"Đã khắc phục",
            "note":"Service restored and monitored.", "createdAt":"2026-10-08T00:01:00Z"
        }))
        .expect("incident event contract");
        assert_eq!(event.event_type, "resolved");
        assert_eq!(event.to_status, "Đã khắc phục");

        let incident: HelpdeskIncident = detail.incident.clone();
        let list: HelpdeskIncidentsResponse =
            serde_json::from_value(json!({"data":[incident]})).expect("incident list contract");
        assert_eq!(list.data.len(), 1);
        let single: HelpdeskIncidentResponse = serde_json::from_value(json!({
            "incident": list.data[0]
        }))
        .expect("incident response contract");
        assert_eq!(single.incident.key, "incident-1");

        let resolution = ResolveHelpdeskIncidentInput {
            resolution_note: "Service restored and monitored.".to_owned(),
        };
        assert_eq!(
            serde_json::to_value(resolution).unwrap()["resolutionNote"],
            "Service restored and monitored."
        );
    }

    #[test]
    fn helpdesk_legacy_import_contract_contains_summary_only_counts() {
        let preview: LegacyHelpdeskTicketImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-TICKETS-B213FBF9-2",
            "sourceRecords":2,
            "importableRecords":1,
            "alreadyImportedRecords":0,
            "conflictedRecords":1,
            "ticketRecords":2,
            "canApply":false
        }))
        .expect("ticket import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.conflicted_records, 1);
        assert!(!preview.can_apply);

        let imported: LegacyHelpdeskTicketImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":0,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("ticket import result contract");
        assert_eq!(imported.imported_records, 1);
    }

    #[test]
    fn helpdesk_incident_import_contract_contains_only_summary_counts() {
        let preview: LegacyHelpdeskIncidentImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-INCIDENTS-B213FBF9-1",
            "sourceRecords":1,
            "importableRecords":1,
            "alreadyImportedRecords":0,
            "conflictedRecords":0,
            "incidentRecords":1,
            "canApply":true
        }))
        .expect("legacy incident import preview contract");
        assert_eq!(preview.incident_records, 1);
        assert_eq!(preview.importable_records, 1);
        assert!(preview.can_apply);

        let imported: LegacyHelpdeskIncidentImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":0,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("legacy incident import result contract");
        assert_eq!(imported.imported_records, 1);
    }

    #[test]
    fn asset_items_import_contract_decodes_summary_and_append_only_result() {
        let preview: LegacyAssetItemsImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_ITEMS 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,
            "targetRecords":5,
            "importableRecords":1,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "batchAlreadyApplied":false,
            "canApply":true
        }))
        .expect("asset items import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.target_records, 5);
        assert_eq!(preview.importable_records, 1);
        assert_eq!(preview.already_imported_records, 1);
        assert!(!preview.batch_already_applied);
        assert!(preview.can_apply);

        let imported: LegacyAssetItemsImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":1,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("asset items import result contract");
        assert_eq!(imported.imported_records, 1);
        assert_eq!(imported.already_imported_records, 1);
    }

    #[test]
    fn reports_catalog_import_contract_decodes_source_mode_conflicts_and_result() {
        let preview: LegacyReportsCatalogImportPreview = serde_json::from_value(json!({
            "batchId":"3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            "sourceMode":"browser_cache_fallback",
            "payloadSha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "confirmationPhrase":"NHẬP REPORTS_CATALOG 4 3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            "sourceRecords":4,
            "targetRecords":2,
            "importableRecords":2,
            "identicalRecords":1,
            "conflictingRecords":1,
            "batchAlreadyApplied":false,
            "canApply":false
        }))
        .expect("reports catalog import preview contract");
        assert_eq!(preview.source_mode, "browser_cache_fallback");
        assert_eq!(preview.importable_records, 2);
        assert_eq!(preview.identical_records, 1);
        assert_eq!(preview.conflicting_records, 1);
        assert!(!preview.can_apply);

        let imported: LegacyReportsCatalogImportResult = serde_json::from_value(json!({
            "batchId":"3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            "importedRecords":3,
            "identicalRecords":1,
            "importedAt":"2026-10-11T00:00:00Z"
        }))
        .expect("reports catalog import result contract");
        assert_eq!(imported.imported_records, 3);
        assert_eq!(imported.identical_records, 1);
    }

    #[test]
    fn asset_allocations_import_contract_reports_unverified_legacy_claim_counts() {
        let preview: LegacyAssetAllocationsImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_ALLOCATIONS 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,
            "targetRecords":5,
            "importableRecords":1,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "legacySignatureClaims":1,
            "legacyWarehouseReceiptClaims":1,
            "batchAlreadyApplied":false,
            "canApply":true
        }))
        .expect("asset allocations import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.importable_records, 1);
        assert_eq!(preview.legacy_signature_claims, 1);
        assert_eq!(preview.legacy_warehouse_receipt_claims, 1);
        assert!(preview.can_apply);

        let imported: LegacyAssetAllocationsImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":1,
            "importedAt":"2026-10-09T00:00:00Z"
        }))
        .expect("asset allocations import result contract");
        assert_eq!(imported.imported_records, 1);
        assert_eq!(imported.already_imported_records, 1);
    }

    #[test]
    fn asset_transfers_import_contract_reports_unverified_claims_and_preserved_duplicate_codes() {
        let preview: LegacyAssetTransfersImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceMode":"browser_cache_fallback",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_TRANSFERS 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,
            "targetRecords":5,
            "importableRecords":1,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "legacyApprovalClaims":1,
            "legacyReceiptClaims":1,
            "duplicateTransferCodeRecords":1,
            "batchAlreadyApplied":false,
            "canApply":true
        }))
        .expect("asset transfers import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.source_mode, "browser_cache_fallback");
        assert_eq!(preview.legacy_approval_claims, 1);
        assert_eq!(preview.legacy_receipt_claims, 1);
        assert_eq!(preview.duplicate_transfer_code_records, 1);
        assert!(preview.can_apply);

        let imported: LegacyAssetTransfersImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":1,
            "importedAt":"2026-10-09T00:00:00Z"
        }))
        .expect("asset transfers import result contract");
        assert_eq!(imported.imported_records, 1);
        assert_eq!(imported.already_imported_records, 1);
    }

    #[test]
    fn asset_depreciations_import_contract_decodes_history_claims_and_result() {
        let preview: super::LegacyAssetDepreciationsImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceMode":"server_collection",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_DEPRECIATIONS 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,
            "targetRecords":5,
            "importableRecords":1,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "duplicateAssetCodeRecords":1,
            "legacyHistoryClaims":2,
            "batchAlreadyApplied":false,
            "canApply":true
        }))
        .expect("depreciation import preview contract");
        assert_eq!(preview.duplicate_asset_code_records, 1);
        assert_eq!(preview.legacy_history_claims, 2);
        assert!(preview.can_apply);
        let imported: super::LegacyAssetDepreciationsImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":1,
            "importedAt":"2026-10-10T00:00:00Z"
        }))
        .expect("depreciation import result contract");
        assert_eq!(imported.imported_records, 1);
        assert_eq!(imported.already_imported_records, 1);
    }

    #[test]
    fn asset_disposals_import_contract_reports_wipe_claims_and_duplicate_codes() {
        let preview: LegacyAssetDisposalsImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceMode":"browser_cache_fallback",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_DISPOSALS 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,"targetRecords":5,"importableRecords":2,
            "alreadyImportedRecords":0,"conflictedRecords":0,"legacyWipeClaims":1,
            "duplicateDisposalCodeRecords":1,"batchAlreadyApplied":false,"canApply":true
        }))
        .expect("asset disposal import preview contract");
        assert_eq!(preview.source_mode, "browser_cache_fallback");
        assert_eq!(preview.legacy_wipe_claims, 1);
        assert_eq!(preview.duplicate_disposal_code_records, 1);
        assert!(preview.can_apply);
        let imported: LegacyAssetDisposalsImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":2,"alreadyImportedRecords":0,"importedAt":"2026-10-09T00:00:00Z"
        }))
        .expect("asset disposal import result contract");
        assert_eq!(imported.imported_records, 2);
    }

    #[test]
    fn asset_maintenances_import_contract_reports_unverified_history_claims() {
        let preview: LegacyAssetMaintenancesImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceMode":"browser_cache_fallback",
            "payloadSha256":"abc123",
            "confirmationPhrase":"NHẬP ASSET_MAINTENANCES 2 b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceRecords":2,
            "targetRecords":5,
            "importableRecords":1,
            "alreadyImportedRecords":1,
            "conflictedRecords":0,
            "duplicateMaintenanceCodes":1,
            "legacyCompletionClaims":2,
            "legacyCertificateClaims":1,
            "legacyCompletedChecklistRecords":1,
            "batchAlreadyApplied":false,
            "canApply":true
        }))
        .expect("asset maintenances import preview contract");
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.source_mode, "browser_cache_fallback");
        assert_eq!(preview.duplicate_maintenance_codes, 1);
        assert_eq!(preview.legacy_completion_claims, 2);
        assert_eq!(preview.legacy_certificate_claims, 1);
        assert_eq!(preview.legacy_completed_checklist_records, 1);
        assert!(preview.can_apply);

        let imported: LegacyAssetMaintenancesImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedRecords":1,
            "alreadyImportedRecords":1,
            "importedAt":"2026-10-09T00:00:00Z"
        }))
        .expect("asset maintenances import result contract");
        assert_eq!(imported.imported_records, 1);
        assert_eq!(imported.already_imported_records, 1);
    }

    #[test]
    fn legacy_employee_bank_import_contract_contains_only_summary_counts() {
        let preview: LegacyEmployeeBankImportPreview = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "payloadSha256":"abc123",
            "confirmationPhrase":"IMPORT-BANK-B213FBF9-5",
            "sourceRecords":5,
            "importableAccounts":3,
            "quarantinedRecords":2,
            "alreadyImportedRecords":0,
            "genericCollectionRecords":1,
            "localStorageRecords":3,
            "employeeProfileRecords":1,
            "canApply":true
        }))
        .expect("employee bank import preview contract");
        assert_eq!(preview.importable_accounts, 3);
        assert_eq!(preview.quarantined_records, 2);
        assert!(preview.can_apply);

        let imported: LegacyEmployeeBankImportResult = serde_json::from_value(json!({
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "importedAccounts":3,
            "quarantinedRecords":2,
            "alreadyImportedRecords":0,
            "importedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("employee bank import result contract");
        assert_eq!(imported.imported_accounts, 3);
        assert_eq!(imported.quarantined_records, 2);
    }

    #[test]
    fn legacy_employee_bank_quarantine_contract_contains_masked_account_and_review_audit() {
        let response: LegacyEmployeeBankQuarantineResponse = serde_json::from_value(json!({
            "data":[{
                "sourceKeySha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                "sourceKind":"local_storage",
                "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
                "issueCode":"unknown_employee_code",
                "employeeCode":"EMP-OLD",
                "bankName":"ACB",
                "accountNumberMasked":"•••• 3333",
                "createdAt":"2026-10-08T00:00:00Z"
            }],
            "pagination":{"page":1,"pageSize":50,"total":1,"totalPages":1}
        }))
        .expect("bank quarantine response");
        assert_eq!(response.data[0].account_number_masked, "•••• 3333");
        assert_eq!(response.pagination.total, 1);

        let adopted: LegacyEmployeeBankQuarantineReview = serde_json::from_value(json!({
            "sourceKeySha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "action":"adopted",
            "accountId":"account-1",
            "resolvedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("bank quarantine review response");
        assert_eq!(adopted.action, "adopted");
        assert_eq!(adopted.account_id.as_deref(), Some("account-1"));

        let dismissed: LegacyEmployeeBankQuarantineReview = serde_json::from_value(json!({
            "sourceKeySha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "action":"dismissed",
            "accountId":null,
            "resolvedAt":"2026-10-08T00:00:00Z"
        }))
        .expect("bank quarantine dismissal response");
        assert_eq!(dismissed.action, "dismissed");
        assert_eq!(dismissed.account_id, None);
    }

    #[test]
    fn system_broadcast_contract_preserves_legacy_json_names() {
        let payload = r#"{"data":[{"id":"SYS-1","title":"Bảo trì","content":"Tối nay","type":"maintenance","targetAudience":"Tất cả nhân sự","sender":"Admin","createdAt":"2026-10-08 09:00","channels":["In-app"],"readCount":0,"totalRecipients":0,"status":"Nháp"}]}"#;
        let response: SystemBroadcastsResponse =
            serde_json::from_str(payload).expect("system broadcast response");
        assert_eq!(response.data[0].broadcast_type, "maintenance");
        assert_eq!(response.data[0].target_audience, "Tất cả nhân sự");
        assert_eq!(response.data[0].scheduled_at, None);

        let input = SystemBroadcastInput {
            title: "Bảo trì".to_owned(),
            content: "Tối nay".to_owned(),
            broadcast_type: "maintenance".to_owned(),
            target_audience: "Tất cả nhân sự".to_owned(),
            channels: vec!["In-app".to_owned()],
        };
        let encoded = serde_json::to_value(input).expect("system broadcast input JSON");
        assert_eq!(encoded["type"], "maintenance");
        assert_eq!(encoded["targetAudience"], "Tất cả nhân sự");
        assert!(encoded.get("broadcastType").is_none());
    }

    #[test]
    fn activation_email_template_contract_uses_camel_case_and_safe_config_status() {
        let payload = r#"{"template":{"subject":"Kích hoạt","heading":"Chào mừng","body":"Văn bản","buttonLabel":"Bắt đầu","footer":"Hết hạn sau 02 ngày"},"emailConfigured":false}"#;
        let response: ActivationEmailTemplateResponse =
            serde_json::from_str(payload).expect("activation template response");
        assert!(!response.email_configured);
        assert_eq!(response.template.button_label, "Bắt đầu");

        let encoded =
            serde_json::to_value(response.template).expect("activation template request JSON");
        assert_eq!(encoded["buttonLabel"], "Bắt đầu");
        assert!(encoded.get("button_label").is_none());
    }

    #[test]
    fn file_list_decodes_backend_contract() {
        let payload = r#"{"data":[{"id":"folder-1","name":"System","type":"dir","sizeBytes":0,"modified":"2026-10-08T00:00:00Z","isProtected":true}],"context":{"parentId":"root-1","rootLabel":"Nhân Sự"}}"#;
        let result: FileListResponse = serde_json::from_str(payload).expect("file response");
        assert_eq!(result.context.parent_id, "root-1");
        assert_eq!(result.data[0].node_type, "dir");
        assert!(result.data[0].is_protected);
    }

    #[test]
    fn file_metadata_decodes_backend_mime_field() {
        let payload = r#"{"data":[{"id":"file-1","name":"ảnh.png","type":"file","mime":"image/png","sizeBytes":12,"modified":"2026-10-08T00:00:00Z"}],"context":{"parentId":"folder-1","rootLabel":"Tài liệu"}}"#;
        let result: FileListResponse = serde_json::from_str(payload).expect("file response");
        assert_eq!(result.data[0].mime_type.as_deref(), Some("image/png"));
    }

    #[test]
    fn rename_file_response_decodes_backend_contract() {
        let payload = r#"{"file":{"id":"file-1","name":"Tài liệu","type":"dir","sizeBytes":0,"modified":"2026-10-08T00:00:00Z","isProtected":false}}"#;
        let result: RenameFileResponse = serde_json::from_str(payload).expect("rename response");
        assert_eq!(result.file.id, "file-1");
        assert_eq!(result.file.name, "Tài liệu");
        assert!(!result.file.is_protected);
    }

    #[test]
    fn delete_file_response_decodes_backend_contract() {
        let response: DeleteFileResponse =
            serde_json::from_str(r#"{"deleted":true}"#).expect("delete response");
        assert!(response.deleted);
    }

    #[test]
    fn public_file_share_decodes_file_metadata_and_link_state() {
        let payload = r#"{"share":{"id":"share-1","fileId":"file-1","token":"aa11","isActive":true,"url":"/files/share?token=aa11","createdAt":"2026-10-08T00:00:00Z","updatedAt":"2026-10-08T00:00:00Z","file":{"id":"file-1","name":"ảnh.png","type":"file","mime":"image/png","sizeBytes":19,"modified":"2026-10-08T00:00:00Z","isProtected":false}}}"#;
        let response: PublicFileShareResponse =
            serde_json::from_str(payload).expect("public file share response");
        assert_eq!(response.share.file_id, "file-1");
        assert!(response.share.is_active);
        assert_eq!(response.share.file.as_ref().unwrap().name, "ảnh.png");
        assert_eq!(
            response.share.file.as_ref().unwrap().mime_type.as_deref(),
            Some("image/png")
        );
    }

    #[test]
    fn notification_list_decodes_legacy_wire_fields() {
        let payload = r#"{"data":[{"id":"notif-1","key":"notif-1","userId":"employee-1","title":"Phiếu lương mới","message":"Đã phát hành.","type":"payroll","link":"/employee/payslip","read":false,"unread":true,"time":"Vừa xong","createdAt":"2026-10-08T00:00:00Z"}]}"#;
        let response: UserNotificationsResponse =
            serde_json::from_str(payload).expect("notification response");
        assert_eq!(response.data.len(), 1);
        assert_eq!(response.data[0].notification_type, "payroll");
        assert_eq!(response.data[0].user_id, "employee-1");
        assert!(response.data[0].unread);
        assert!(!response.data[0].read);
    }

    #[test]
    fn audit_log_contract_decodes_real_fields_without_forensic_metadata() {
        let payload = r#"{"data":[{"key":"event-1","id":"event-1","timestamp":"2026-10-09 10:20:30","user":"Quản trị (admin@example.test)","action":"create","module":"Phiếu thu chi","detail":"Đối tượng: voucher-1"}],"pagination":{"page":1,"limit":50,"total":1,"totalPages":1}}"#;
        let response: AuditLogsResponse = serde_json::from_str(payload).expect("audit response");
        assert_eq!(response.data[0].id, "event-1");
        assert_eq!(response.data[0].user, "Quản trị (admin@example.test)");
        assert_eq!(response.pagination.total_pages, 1);

        let recorded: AuditEventRecordedResponse =
            serde_json::from_str(r#"{"recorded":true,"id":"event-2"}"#).expect("record response");
        assert!(recorded.recorded);
        assert_eq!(recorded.id, "event-2");

        let entry = &response.data[0];
        assert_eq!(entry.action, "create");
        assert_eq!(entry.module, "Phiếu thu chi");
    }

    #[test]
    fn employee_payslip_contract_preserves_missing_values_and_unverified_source_state() {
        let payload = r#"{"data":[{"id":"pay-1","month":"2026-08","basicSalary":42000000,"allowance":null,"bonusKpi":2500000,"insuranceDeduction":4410000,"personalTax":1200000,"netSalary":null,"sourceStatus":"Đã thanh toán","dataStatus":"unverified","signedStatus":"Đã ký số xác nhận","signerName":"Employee"}],"pagination":{"page":1,"limit":10,"total":1,"totalPages":1}}"#;
        let response: EmployeePayslipsResponse =
            serde_json::from_str(payload).expect("employee payslip response");
        let payslip = &response.data[0];
        assert_eq!(payslip.id, "pay-1");
        assert_eq!(payslip.basic_salary, Some(42_000_000));
        assert_eq!(payslip.allowance, None);
        assert_eq!(payslip.net_salary, None);
        assert_eq!(payslip.source_status.as_deref(), Some("Đã thanh toán"));
        assert_eq!(payslip.data_status, "unverified");
        assert_eq!(response.pagination.total_pages, 1);

        let _: EmployeePayslip = payslip.clone();
        let _: EmployeePayslipsPagination = response.pagination;
    }

    #[test]
    fn contract_summary_decodes_legacy_names_and_unverified_signature_state() {
        let payload = r#"{"data":[{"key":"contract-1","id":"contract-1","code":"HD-001","name":"Hợp đồng lao động","contractCategory":"labor","contractTemplate":"Hợp đồng chính thức","partyBType":"employee","partyBName":"Nguyễn An","employeeCode":"EMP-001","employeeName":"Nguyễn An","type":"Hợp đồng lao động chính thức","position":"Kỹ sư","department":"R&D","startDate":"2026-01-01","endDate":"2026-12-31","status":"Còn hiệu lực","employeeSignStatus":"Đã ký","employeeSignDate":"2026-01-02T00:00:00Z","companySignStatus":"Đã ký","companySignDate":null,"signatureVerificationStatus":"unverified","createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z","salary":99000000,"employeePhone":"must-not-be-requested"}]}"#;
        let response: ContractsResponse =
            serde_json::from_str(payload).expect("contracts list response");
        let contract = &response.data[0];
        assert_eq!(contract.contract_type, "Hợp đồng lao động chính thức");
        assert_eq!(contract.employee_sign_status, "Đã ký");
        assert_eq!(contract.signature_verification_status, "unverified");
        assert_eq!(contract.company_sign_date, None);
        assert_eq!(contract.id, contract.key);

        let detail: ContractResponse = serde_json::from_str(
            r#"{"contract":{"key":"contract-2","id":"contract-2","code":"HD-002","name":"NDA","contractCategory":"nda","contractTemplate":"NDA","partyBType":"employee","partyBName":"Employee","employeeCode":"EMP-002","employeeName":"Employee","type":"NDA","position":"","department":"","startDate":"","endDate":"","status":"Dự thảo","employeeSignStatus":"Chưa ký","employeeSignDate":null,"companySignStatus":"Chưa ký","companySignDate":null,"signatureVerificationStatus":"unverified","createdAt":"2026-01-01","updatedAt":"2026-01-01"}}"#,
        )
        .expect("contract detail response");
        assert_eq!(detail.contract.id, "contract-2");
    }

    #[test]
    fn contract_detail_decodes_authorized_sensitive_fields_without_requiring_them_in_list_rows() {
        let detail: ContractResponse = serde_json::from_value(json!({
            "contract": {
                "key": "contract-private",
                "id": "contract-private",
                "code": "HD-PRIVATE",
                "name": "Hợp đồng lao động",
                "contractCategory": "labor",
                "contractTemplate": "Hợp đồng chính thức",
                "partyBType": "employee",
                "partyBName": "Nhân viên",
                "employeeCode": "EMP-001",
                "employeeName": "Nhân viên",
                "type": "Hợp đồng lao động",
                "position": "Kỹ sư",
                "department": "R&D",
                "startDate": "2026-01-01",
                "endDate": "2026-12-31",
                "status": "Còn hiệu lực",
                "employeeSignStatus": "Đã ký",
                "employeeSignDate": null,
                "companySignStatus": "Đã ký",
                "companySignDate": null,
                "signatureVerificationStatus": "unverified",
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-02T00:00:00Z",
                "isFull": true,
                "employeePhone": "0900123456",
                "salary": 42000000,
                "ndaClause": true
            }
        }))
        .expect("authorized contract detail");

        assert_eq!(detail.contract.is_full, Some(true));
        assert_eq!(
            detail.contract.employee_phone.as_deref(),
            Some("0900123456")
        );
        assert_eq!(detail.contract.salary, Some(42_000_000));
        assert_eq!(detail.contract.nda_clause, Some(true));
    }

    #[test]
    fn activation_authorization_decodes_legacy_response_shape() {
        let payload = r#"{"activation_token":"scoped-session","expires_at":"2026-10-10T00:00:00Z","user":{"id":"employee-1","email":"employee@example.test","name":"Employee","role":"USER","isActive":false}}"#;
        let authorization: ActivationAuthorization =
            serde_json::from_str(payload).expect("activation response");
        assert_eq!(authorization.activation_token, "scoped-session");
        assert_eq!(authorization.user.email, "employee@example.test");
        assert!(!authorization.user.is_active);
    }

    #[test]
    fn admin_user_list_decodes_profile_and_pagination_contract() {
        let payload = r#"{"data":[{"id":"user-1","email":"user@example.test","name":"User One","role":"USER","isActive":true,"employeeCode":"NV-0009","department":"Finance","position":"Accountant","activationStatus":"active","createdAt":"2026-10-08T00:00:00Z","updatedAt":"2026-10-08T00:00:00Z"}],"pagination":{"page":1,"limit":20,"total":3},"summary":{"total":40,"active":32,"admins":3}}"#;
        let page: UsersPage = serde_json::from_str(payload).expect("users response");

        assert_eq!(page.data[0].employee_code, "NV-0009");
        assert_eq!(page.data[0].department, "Finance");
        assert_eq!(page.data[0].activation_status, "active");
        assert_eq!(page.pagination.page, 1);
        assert_eq!(page.pagination.limit, 20);
        assert_eq!(page.pagination.total, 3);
        let summary = page.summary.expect("global user summary");
        assert_eq!(summary.total, 40);
        assert_eq!(summary.active, 32);
        assert_eq!(summary.admins, 3);
    }

    #[test]
    fn admin_user_search_query_encoding_preserves_vietnamese_and_reserved_characters() {
        assert_eq!(
            encode_path_segment("Phòng Kế toán/HR?"),
            "Ph%C3%B2ng%20K%E1%BA%BF%20to%C3%A1n%2FHR%3F"
        );
    }

    #[test]
    fn dashboard_stats_decode_real_metrics_and_unavailable_sources() {
        let payload = r#"{"totalUsers":2,"activeUsers":1,"totalEmployees":2,"newEmployeesThisMonth":1,"monthlyRevenue":0,"monthlyExpense":0,"pendingApprovalsCount":3,"pendingWorkflows":[],"recentAuditLogs":[],"financialMetricsAvailable":false,"auditLogsAvailable":false}"#;
        let stats: DashboardStats = serde_json::from_str(payload).expect("dashboard stats");

        assert_eq!(stats.total_employees, 2);
        assert_eq!(stats.active_users, 1);
        assert_eq!(stats.pending_approvals_count, 3);
        assert!(!stats.financial_metrics_available);
        assert!(!stats.audit_logs_available);
    }

    #[test]
    fn employee_contract_decodes_legacy_fields_and_non_sent_delivery() {
        let list = r#"{"data":[{"id":"employee-1","key":"employee-1","code":"NV-0001","employeeCode":"NV-0001","name":"Employee One","email":"employee@example.test","phone":"0900000000","department":"Finance","position":"Accountant","status":"Thử việc","joinDate":"2026-10-01","salaryBase":25000000,"role":"USER","isActive":false,"activationStatus":"Chờ kích hoạt"}]}"#;
        let employees: EmployeeListResponse = serde_json::from_str(list).expect("employee list");
        assert_eq!(employees.data[0].code, "NV-0001");
        assert_eq!(employees.data[0].salary_base, 25_000_000);
        assert!(!employees.data[0].is_active);

        let created = r#"{"employee":{"id":"employee-2","code":"NV-0002","name":"Employee Two","email":"two@example.test","status":"Chính thức","salaryBase":0,"isActive":false,"activationStatus":"Chờ kích hoạt"},"delivery":{"status":"not_configured","message":"SMTP is not configured"},"expiresAt":"2026-10-09T00:00:00Z"}"#;
        let created: EmployeeCreateResponse =
            serde_json::from_str(created).expect("employee create response");
        assert_eq!(created.employee.id, "employee-2");
        assert_eq!(created.delivery.status, "not_configured");
        assert_eq!(
            created.delivery.message.as_deref(),
            Some("SMTP is not configured")
        );

        let profile = r#"{"employee":{"id":"employee-1","employeeCode":"NV-0001","name":"Employee One","email":"employee@example.test","phone":"0900000000","address":"12 Đường Lê Lợi","department":"Finance","position":"Accountant","status":"Chính thức","joinDate":"2026-01-01","salaryBase":25000000,"isActive":true}}"#;
        let profile: EmployeeResponse = serde_json::from_str(profile).expect("my profile");
        assert_eq!(profile.employee.id, "employee-1");
        assert_eq!(profile.employee.phone, "0900000000");
        assert_eq!(profile.employee.address, "12 Đường Lê Lợi");
        assert_eq!(
            super::employee_contact_update_payload("0900000000", "12 Đường Lê Lợi"),
            json!({ "phone": "0900000000", "address": "12 Đường Lê Lợi" })
        );
    }

    #[test]
    fn org_unit_collection_decodes_legacy_camel_case_record() {
        let payload = r#"{"data":[{"id":"org-id","key":"ou-finance","code":"FIN","name":"Tài chính","parentUnit":"Khối vận hành","manager":"Nguyễn An","managerTitle":"Trưởng phòng","managerEmail":"an@example.test","managerPhone":"0900000000","headcountLimit":12,"actualHeadcount":8,"location":"Hà Nội","establishedDate":"2024-01-01","annualBudget":1200000000,"budgetSpent":300000000,"status":"Đang hoạt động"}],"pagination":{"page":1,"limit":1,"total":1}}"#;
        let units: OrgUnitsResponse = serde_json::from_str(payload).expect("org units");
        let unit = &units.data[0];
        assert_eq!(unit.key, "ou-finance");
        assert_eq!(unit.parent_unit, "Khối vận hành");
        assert_eq!(unit.headcount_limit, 12);
        assert_eq!(unit.annual_budget, 1_200_000_000);
        assert_eq!(unit.status, "Đang hoạt động");
        let stored_record = serde_json::to_value(unit).expect("org unit write payload");
        assert_eq!(stored_record["parentUnit"], "Khối vận hành");
        assert!(stored_record.get("actualHeadcount").is_none());
        assert!(stored_record.get("id").is_none());
    }

    #[test]
    fn attendance_shift_contract_preserves_legacy_fields_and_camel_case() {
        let payload = r#"{"data":[{"key":"shift-1","shiftCode":"CA-HC-01","shiftName":"Ca hành chính","timeRange":"08:00 - 17:30","startTime":"08:00","endTime":"17:30","workingHours":8.0,"workUnits":1.0,"breakTime":"12:00 - 13:30","applicableTo":"Khối văn phòng","allowGraceMinutes":15,"nightAllowancePct":0,"shiftCategory":"Hành chính","status":"Đang áp dụng","legacyNote":"Preserve me","createdAt":"2026-01-01T00:00:00Z"}],"revision":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}"#;
        let response: AttendanceShiftsResponse =
            serde_json::from_str(payload).expect("attendance shifts response");
        let shift = &response.data[0];
        assert_eq!(response.revision.len(), 64);
        assert_eq!(shift.shift_code, "CA-HC-01");
        assert_eq!(shift.working_hours, 8.0);
        assert_eq!(shift.extra["legacyNote"], "Preserve me");
        assert_eq!(shift.extra["createdAt"], "2026-01-01T00:00:00Z");
        let serialized = serde_json::to_value(shift).expect("shift replacement JSON");
        assert_eq!(serialized["shiftCode"], "CA-HC-01");
        assert_eq!(serialized["legacyNote"], "Preserve me");
        assert!(serialized.get("shift_code").is_none());

        let write = super::attendance_shift_replace_payload(&response.data, &response.revision);
        assert_eq!(write["expectedRevision"], response.revision);
        assert_eq!(write["records"][0]["shiftCode"], "CA-HC-01");
        assert!(write.get("expected_revision").is_none());
    }

    #[test]
    fn asset_collection_preserves_legacy_fields_and_revision_payload() {
        let response: super::AssetItemsResponse = serde_json::from_value(json!({
            "data": [{
                "key": "asset-1",
                "code": "TS-001",
                "barcode": "89360010001",
                "name": "Máy tính xách tay",
                "category": "Thiết bị IT",
                "model": "Model X",
                "purchaseDate": "2026-01-01",
                "supplier": "Nhà cung cấp",
                "originalPrice": 24000000,
                "depreciationMonths": 36,
                "accumulatedDepreciation": 2000000,
                "netBookValue": 22000000,
                "location": "Hà Nội",
                "assignedTo": "Nguyễn An",
                "department": "Kỹ thuật",
                "status": "Đang sử dụng",
                "warrantyExpiry": "2027-01-01",
                "specs": "16 GB RAM",
                "notes": "Ghi chú",
                "legacyTag": {"source": "localStorage"}
            }],
            "revision": "asset-revision-v1"
        }))
        .expect("asset collection response");

        let asset = &response.data[0];
        assert_eq!(response.revision, "asset-revision-v1");
        assert_eq!(asset.purchase_date, "2026-01-01");
        assert_eq!(asset.assigned_to, "Nguyễn An");
        assert_eq!(asset.original_price, json!(24_000_000));
        assert_eq!(asset.extra["legacyTag"]["source"], "localStorage");

        let serialized = serde_json::to_value(asset).expect("asset replacement JSON");
        assert_eq!(serialized["purchaseDate"], "2026-01-01");
        assert_eq!(serialized["legacyTag"]["source"], "localStorage");
        assert!(serialized.get("purchase_date").is_none());

        let payload = super::asset_items_replace_payload(&response.data, &response.revision);
        assert_eq!(payload["expectedRevision"], "asset-revision-v1");
        assert_eq!(payload["records"][0]["code"], "TS-001");
        assert!(payload.get("expected_revision").is_none());
    }

    #[test]
    fn generic_collection_decodes_asset_materials_without_dropping_legacy_fields() {
        let response: super::GenericCollectionResponse = serde_json::from_value(json!({
            "data": [{
                "key": "mat-1",
                "materialCode": "LK-SSD-01",
                "materialName": "Ổ SSD Enterprise",
                "stockQty": 7,
                "stockHistory": [{"ticketCode":"NK-001","legacyNote":"giữ nguyên"}],
                "customLegacyField": {"source":"browser"}
            }],
            "pagination": {"page":1,"limit":500,"total":1,"totalPages":1},
            "revision": "materials-revision-v1"
        }))
        .expect("generic collection response");
        assert_eq!(response.data.len(), 1);
        assert_eq!(response.revision, "materials-revision-v1");
        assert_eq!(response.data[0]["materialCode"], "LK-SSD-01");
        assert_eq!(
            response.data[0]["stockHistory"][0]["legacyNote"],
            "giữ nguyên"
        );
        assert_eq!(response.data[0]["customLegacyField"]["source"], "browser");

        let mutation: super::GenericRecordResponse = serde_json::from_value(json!({
            "record": {"key":"mat-1","stockQty":8,"customLegacyField":{"source":"browser"}}
        }))
        .expect("generic record response");
        assert_eq!(mutation.record["stockQty"], 8);
        assert_eq!(mutation.record["customLegacyField"]["source"], "browser");
        assert!(mutation.revision.is_empty());

        let revisioned_mutation: super::GenericRecordResponse = serde_json::from_value(json!({
            "record": {"key":"mat-1","stockQty":9},
            "revision": "materials-revision-v2"
        }))
        .expect("revisioned generic record response");
        assert_eq!(revisioned_mutation.revision, "materials-revision-v2");
    }

    #[test]
    fn asset_collection_tolerates_nullable_legacy_text_fields() {
        let response: super::AssetItemsResponse = serde_json::from_value(json!({
            "data": [{
                "key": null,
                "code": "TS-NULL-KEY",
                "name": null,
                "category": null,
                "status": null,
                "originalPrice": "1200000",
                "extraLegacyField": {"kept": true}
            }],
            "revision": "asset-revision-null"
        }))
        .expect("nullable legacy asset fields");
        let asset = &response.data[0];
        assert!(asset.key.is_empty());
        assert_eq!(asset.code, "TS-NULL-KEY");
        assert!(asset.name.is_empty());
        assert!(asset.category.is_empty());
        assert!(asset.status.is_empty());
        assert_eq!(asset.original_price, json!("1200000"));
        assert_eq!(asset.extra["extraLegacyField"]["kept"], true);
    }

    #[test]
    fn asset_allocation_contract_preserves_legacy_data_without_claiming_a_verified_signature() {
        let response: super::AssetAllocationsResponse = serde_json::from_value(json!({
            "data": [{
                "id": "legacy-alloc-1",
                "key": "legacy-alloc-1",
                "type": "Cấp phát",
                "ticketCode": "CP-2026-001",
                "assetCode": "TS-IT-001",
                "assetName": "Laptop",
                "serialNo": null,
                "employeeCode": "EMP-001",
                "employeeName": "Nguyễn An",
                "department": "Kỹ thuật",
                "position": "Kỹ sư",
                "handoverPerson": "Lê Bình",
                "allocatedDate": "2026-10-09",
                "expectedReturnDate": "Vô thời hạn (Theo HĐLĐ)",
                "purpose": "Cấp phát chính thức cho nhân viên mới",
                "condition": "Tốt",
                "accessories": "Sạc",
                "compensationAmount": 0,
                "signedByReceiver": true,
                "signedAt": "2026-10-09 10:30",
                "status": "Đã bàn giao hoàn tất",
                "notes": null,
                "legacySource": {"version": 2}
            }],
            "revision": "allocation-revision-v1"
        }))
        .expect("asset allocations response");

        let allocation = &response.data[0];
        assert_eq!(allocation.key, "legacy-alloc-1");
        assert_eq!(allocation.operation_type, "Cấp phát");
        assert!(allocation.serial_no.is_empty());
        assert!(allocation.received_at.is_none());
        assert!(allocation.signed_by_receiver);
        assert_eq!(allocation.extra["id"], "legacy-alloc-1");
        assert_eq!(allocation.extra["legacySource"]["version"], 2);

        let serialized = serde_json::to_value(allocation).expect("allocation round trip");
        assert_eq!(serialized["type"], "Cấp phát");
        assert_eq!(serialized["signedByReceiver"], true);
        assert_eq!(serialized["legacySource"]["version"], 2);
        assert!(serialized.get("operation_type").is_none());

        let payload = super::asset_allocations_replace_payload(&response.data, &response.revision);
        assert_eq!(payload["expectedRevision"], "allocation-revision-v1");
        assert_eq!(payload["records"][0]["key"], "legacy-alloc-1");
    }

    #[test]
    fn asset_allocation_wire_response_decodes_account_acknowledgement_separately_from_signature() {
        let response: super::AssetAllocationMutationResponse = serde_json::from_value(json!({
            "allocation": {
                "key": "alloc-1",
                "type": "Cấp phát",
                "status": "Đã bàn giao hoàn tất",
                "signedByReceiver": false,
                "receivedByAccount": true,
                "receivedAt": "2026-10-09T10:00:00Z",
                "receivedByUserId": "employee-1",
                "receivedByName": "Nguyễn An",
                "acknowledgementMethod": "authenticated_employee_account"
            }
        }))
        .expect("asset allocation acknowledgement response");

        assert!(response.allocation.received_by_account);
        assert!(!response.allocation.signed_by_receiver);
        assert_eq!(
            response.allocation.received_by_user_id.as_deref(),
            Some("employee-1")
        );
        assert_eq!(
            response.allocation.acknowledgement_method.as_deref(),
            Some("authenticated_employee_account")
        );
    }

    #[test]
    fn leave_request_collection_contract_carries_optimistic_revision() {
        let response: LeaveRequestsResponse = serde_json::from_value(json!({
            "data": [{
                "key": "leave-1",
                "code": "NP-2026-001",
                "employeeName": "Nguyễn An",
                "department": "Kỹ thuật",
                "leaveType": "Nghỉ phép năm",
                "startDate": "2026-10-10",
                "endDate": "2026-10-10",
                "daysCount": 1,
                "reason": "Việc riêng",
                "status": "Chờ duyệt"
            }],
            "revision": "leave-revision-v1"
        }))
        .expect("revisioned leave request collection response");
        assert_eq!(response.data.len(), 1);
        assert_eq!(response.revision, "leave-revision-v1");

        let payload = super::leave_requests_replace_payload(&response.data, &response.revision);
        assert_eq!(payload["expectedRevision"], "leave-revision-v1");
        assert_eq!(payload["records"][0]["code"], "NP-2026-001");
        assert!(payload.get("expected_revision").is_none());
    }

    #[test]
    fn attendance_shift_assignment_contract_uses_hr_and_shift_keys() {
        let input = CreateAttendanceShiftAssignment {
            code: "PC-20261008-001".to_owned(),
            employee_id: "employee-1".to_owned(),
            shift_key: "shift-1".to_owned(),
            effective_from: "2026-10-08".to_owned(),
            effective_to: "2026-12-31".to_owned(),
        };
        let input = serde_json::to_value(input).expect("assignment input");
        assert_eq!(input["employeeId"], "employee-1");
        assert_eq!(input["shiftKey"], "shift-1");
        assert!(input.get("employeeName").is_none());
        assert!(input.get("shiftName").is_none());

        let payload = json!({
            "data": [{
                "id": "assignment-1",
                "code": "PC-20261008-001",
                "employeeId": "employee-1",
                "employeeCode": "EMP-001",
                "employeeName": "Employee One",
                "department": "Operations",
                "position": "Engineer",
                "shiftKey": "shift-1",
                "shiftCode": "SHIFT-01",
                "shiftName": "Day Shift",
                "timeRange": "08:00 - 17:00",
                "workingHours": 8.0,
                "workUnits": 1.0,
                "effectiveFrom": "2026-10-08",
                "effectiveTo": "2026-12-31",
                "status": "Đang áp dụng",
                "createdBy": "admin-1",
                "createdAt": "2026-10-08T00:00:00Z",
                "updatedAt": "2026-10-08T00:00:00Z"
            }]
        });
        let response: AttendanceShiftAssignmentsResponse =
            serde_json::from_value(payload).expect("assignment response");
        let assignment: &AttendanceShiftAssignment = &response.data[0];
        assert_eq!(assignment.employee_code, "EMP-001");
        assert_eq!(assignment.shift_name, "Day Shift");
        assert_eq!(assignment.working_hours, 8.0);
    }

    #[test]
    fn leave_request_contract_preserves_legacy_aliases_and_unknown_fields() {
        let payload = r#"{"data":[{"key":"leave-1","code":"NP-001","employeeName":"Nguyễn An","department":"Kỹ thuật","type":"Nghỉ phép năm","fromDate":"2026-10-10","toDate":"2026-10-10","days":"0.5","reason":"Việc gia đình","status":"Chờ duyệt","legacyFlag":true}],"pagination":{"total":1}}"#;
        let response: LeaveRequestsResponse =
            serde_json::from_str(payload).expect("leave request response");
        let request = &response.data[0];
        assert_eq!(request.effective_leave_type(), "Nghỉ phép năm");
        assert_eq!(request.effective_start_date(), "2026-10-10");
        assert_eq!(request.effective_end_date(), "2026-10-10");
        assert_eq!(request.effective_days_count(), Some(0.5));
        assert_eq!(request.extra["legacyFlag"], json!(true));
        let serialized = serde_json::to_value(request).expect("leave request write JSON");
        assert_eq!(serialized["type"], "Nghỉ phép năm");
        assert_eq!(serialized["fromDate"], "2026-10-10");
        assert_eq!(serialized["days"], "0.5");
        assert_eq!(serialized["legacyFlag"], true);
        assert!(serialized.get("employee_name").is_none());

        let new_request = LeaveRequestRecord {
            key: "leave-2".to_owned(),
            code: "NP-002".to_owned(),
            employee_id: Some("employee-2".to_owned()),
            employee_code: Some("NV-0002".to_owned()),
            employee_name: "Trần Bình".to_owned(),
            department: "Kỹ thuật".to_owned(),
            leave_type: "Nghỉ phép năm".to_owned(),
            start_date: "2026-10-12".to_owned(),
            end_date: "2026-10-12".to_owned(),
            days_count: Some(1.0),
            reason: "Việc riêng".to_owned(),
            status: "Chờ duyệt".to_owned(),
            handover_person: None,
            contact_phone: None,
            extra: BTreeMap::new(),
        };
        let wire = serde_json::to_value(new_request).expect("new leave request JSON");
        assert_eq!(wire["employeeId"], "employee-2");
        assert_eq!(wire["employeeCode"], "NV-0002");
        assert_eq!(wire["employeeName"], "Trần Bình");
        assert_eq!(wire["leaveType"], "Nghỉ phép năm");
        assert_eq!(wire["startDate"], "2026-10-12");
        assert_eq!(wire["daysCount"], 1.0);
    }

    #[test]
    fn authenticated_leave_request_contract_uses_server_owned_identity() {
        let payload = json!({
            "id": "request-1",
            "code": "NP-20261008-AB12CD34",
            "employeeId": "employee-1",
            "employeeCode": "EMP-001",
            "employeeName": "Nguyễn An",
            "department": "Kỹ thuật",
            "leaveType": "Nghỉ phép năm",
            "startDate": "2026-10-10",
            "endDate": "2026-10-10",
            "days": 0.5,
            "reason": "Việc gia đình",
            "handoverPerson": null,
            "contactPhone": null,
            "status": "Chờ duyệt",
            "reviewerId": null,
            "reviewerName": "",
            "reviewNote": "",
            "reviewedAt": "",
            "createdAt": "2026-10-08T00:00:00Z",
            "updatedAt": "2026-10-08T00:00:00Z"
        });
        let request: EmployeeLeaveRequest =
            serde_json::from_value(payload).expect("typed employee leave request");
        assert_eq!(request.employee_id, "employee-1");
        assert_eq!(request.days, 0.5);

        let input = CreateEmployeeLeaveRequest {
            leave_type: "Nghỉ phép năm".to_owned(),
            start_date: "2026-10-10".to_owned(),
            end_date: "2026-10-10".to_owned(),
            days: 0.5,
            reason: "Việc gia đình".to_owned(),
            handover_person: None,
            contact_phone: None,
        };
        let serialized = serde_json::to_value(input).expect("serialized create request");
        assert_eq!(serialized["leaveType"], "Nghỉ phép năm");
        assert_eq!(serialized["days"], 0.5);
        assert!(serialized.get("employeeId").is_none());
        assert!(serialized.get("employeeName").is_none());
        assert!(serialized.get("department").is_none());
    }

    #[test]
    fn workflow_settings_contract_keeps_legacy_camel_case_and_extra_fields() {
        let payload = r#"{"data":[{"key":"tier-1","tierName":"Cấp 1","minAmount":1000,"maxAmount":5000,"requiredLevels":"Trưởng phòng ➔ Giám đốc","slaHours":4,"autoEscalateHours":8,"requirePKI":true,"status":"Kích hoạt","customLegacyFlag":"retained"}]}"#;
        let response: WorkflowSettingsResponse =
            serde_json::from_str(payload).expect("workflow settings response");
        let tier = &response.data[0];
        assert_eq!(tier.tier_name, "Cấp 1");
        assert_eq!(tier.min_amount, 1_000);
        assert_eq!(tier.max_amount, 5_000);
        assert_eq!(tier.sla_hours, 4);
        assert_eq!(tier.auto_escalate_hours, 8);
        assert!(tier.require_pki);
        assert_eq!(tier.extra["customLegacyFlag"], "retained");
    }

    #[test]
    fn overtime_request_contract_preserves_request_fields_without_pay_or_identity_input() {
        let payload = json!({
            "id":"ot-1",
            "code":"OT-20261008-AB12CD34",
            "employeeId":"employee-1",
            "employeeCode":"OT-EMP-001",
            "employeeName":"Employee One",
            "department":"Vận hành",
            "otDate":"2026-10-10",
            "requestedHours":2.5,
            "dayType":"weekend",
            "project":"Release",
            "reason":"Hoàn tất triển khai",
            "status":"Chờ phê duyệt",
            "reviewerId":null,
            "reviewerName":"",
            "reviewNote":"",
            "reviewedAt":"",
            "createdAt":"2026-10-08T00:00:00Z",
            "updatedAt":"2026-10-08T00:00:00Z"
        });
        let request: EmployeeOvertimeRequest =
            serde_json::from_value(payload).expect("typed overtime request");
        assert_eq!(request.requested_hours, 2.5);
        assert_eq!(request.day_type, "weekend");

        let input = CreateEmployeeOvertimeRequest {
            ot_date: "2026-10-10".to_owned(),
            requested_hours: 2.5,
            day_type: "weekend".to_owned(),
            project: "Release".to_owned(),
            reason: "Hoàn tất triển khai".to_owned(),
        };
        let serialized = serde_json::to_value(input).expect("serialized overtime request");
        assert_eq!(serialized["otDate"], "2026-10-10");
        assert_eq!(serialized["requestedHours"], 2.5);
        assert_eq!(serialized["dayType"], "weekend");
        for unsupported in [
            "employeeId",
            "employeeName",
            "department",
            "multiplier",
            "baseHourlyRate",
        ] {
            assert!(serialized.get(unsupported).is_none());
        }
    }

    #[test]
    fn task_contract_decodes_and_serializes_legacy_wire_names() {
        let payload = r#"{"data":[{"key":"task-1","taskCode":"TASK-20261008-A1B2C3D4","taskTitle":"Chuẩn hóa vận hành","description":"Mô tả","projectName":"Vận hành","assigneeId":"employee-1","assignee":"Nguyễn An (NV-1)","createdBy":"Admin","priority":"Cao","dueDate":"2026-10-15","progress":45,"status":"Đang thực hiện","createdAt":"2026-10-08T08:00:00Z","updatedAt":"2026-10-08T09:00:00Z","subtasks":[{"key":"check-1","title":"Rà soát","completed":true,"sortOrder":0}],"comments":[],"activities":[],"reports":[{"key":"report-1","content":"Tiến độ tốt","author":"Nguyễn An","progress":45,"status":"Đang thực hiện","attachments":[{"id":"file-1","key":"f-1","name":"plan.pdf","size":128,"type":"application/pdf"}],"createdAt":"2026-10-08T09:00:00Z"}]}]}"#;
        let tasks: TasksResponse = serde_json::from_str(payload).expect("task response");
        let task = &tasks.data[0];
        assert_eq!(task.task_code, "TASK-20261008-A1B2C3D4");
        assert_eq!(task.subtasks.as_ref().unwrap()[0].sort_order, 0);
        assert_eq!(
            task.reports.as_ref().unwrap()[0].attachments[0].attachment_type,
            "application/pdf"
        );
        let request = serde_json::to_value(CreateTaskInput {
            task_title: "Task".to_owned(),
            description: String::new(),
            project_name: String::new(),
            assignee_id: "employee-1".to_owned(),
            priority: "Cao".to_owned(),
            due_date: String::new(),
            checklist: vec!["Bước một".to_owned()],
        })
        .expect("task create payload");
        assert_eq!(request["taskTitle"], "Task");
        assert_eq!(request["assigneeId"], "employee-1");
        assert_eq!(request["checklist"][0], "Bước một");
    }

    #[test]
    fn json_request_preserves_patch_and_delete_methods() {
        assert_eq!(
            json_request("PATCH", "/users/1".to_owned(), Some(json!({}))).method,
            "PATCH"
        );
        assert_eq!(
            json_request("DELETE", "/employees/1".to_owned(), None).method,
            "DELETE"
        );
        assert_eq!(
            json_request(
                "PUT",
                "/collections/business_org_units".to_owned(),
                Some(json!({ "records": [] }))
            )
            .method,
            "PUT"
        );
        assert_eq!(encode_path_segment("unit one/é"), "unit%20one%2F%C3%A9");
    }

    #[test]
    fn asset_maintenance_wire_contract_round_trips_legacy_fields_and_unknown_data() {
        let maintenance: AssetMaintenance = serde_json::from_value(json!({
            "key":"maintenance-1",
            "maintCode":"BD-2026-01",
            "systemName":"Máy chủ",
            "category":"IDC",
            "assetCodes":"AS-01, AS-02",
            "location":"Hà Nội",
            "frequency":"Hàng quý (3 tháng)",
            "maintenanceType":"Phòng ngừa định kỳ (PM)",
            "slaLevel":"SLA Gold (8h)",
            "lastDate":"2026-10-01",
            "nextDate":"2027-01-01",
            "responsibleEngineer":"Kỹ sư",
            "vendorPartner":"Nhà cung cấp",
            "checklist":[{"item":"Kiểm tra","done":false,"note":null}],
            "estimatedBudget":3500000,
            "actualCost":null,
            "status":"Đã lập kế hoạch",
            "healthScore":null,
            "certificateCode":null,
            "notes":"Ghi chú cũ",
            "customLegacyField":{"kept":true}
        }))
        .expect("legacy-compatible asset maintenance record");
        assert_eq!(maintenance.maint_code, "BD-2026-01");
        assert_eq!(maintenance.checklist[0].item, "Kiểm tra");
        assert_eq!(maintenance.actual_cost, None);
        assert_eq!(maintenance.extra["customLegacyField"]["kept"], true);

        let create = serde_json::to_value(CreateAssetMaintenance {
            maint_code: "BD-2026-02".to_owned(),
            system_name: "Máy chủ".to_owned(),
            category: "IDC".to_owned(),
            asset_codes: "AS-01".to_owned(),
            location: "Hà Nội".to_owned(),
            frequency: "Hàng quý (3 tháng)".to_owned(),
            maintenance_type: "Phòng ngừa định kỳ (PM)".to_owned(),
            sla_level: "SLA Gold (8h)".to_owned(),
            last_date: "2026-10-01".to_owned(),
            next_date: "2027-01-01".to_owned(),
            responsible_engineer: "Kỹ sư".to_owned(),
            vendor_partner: String::new(),
            estimated_budget: 0,
            notes: String::new(),
        })
        .expect("create maintenance payload");
        assert_eq!(create["maintCode"], "BD-2026-02");
        assert_eq!(create["estimatedBudget"], 0);

        let perform = serde_json::to_value(PerformAssetMaintenance {
            checklist: vec![AssetMaintenanceChecklistItem {
                item: "Kiểm tra".to_owned(),
                done: true,
                note: Some("Đạt".to_owned()),
            }],
            health_score: 96,
            actual_cost: 2_000_000,
            notes: "Đã hoàn tất".to_owned(),
        })
        .expect("perform maintenance payload");
        assert_eq!(perform["checklist"][0]["done"], true);
        assert_eq!(perform["healthScore"], 96);
        assert_eq!(perform["actualCost"], 2_000_000);
    }

    #[test]
    fn asset_repair_wire_contract_preserves_legacy_fields_and_typed_events() {
        let repair: super::AssetRepair = serde_json::from_value(json!({
            "key":"repair-1",
            "repairCode":"SC-2026-020",
            "assetCode":"TS-IT-002",
            "assetName":"Laptop",
            "severity":"Cao (P2)",
            "status":"Đang sửa chữa tại hãng",
            "repairCompletionEvent":{"verification":"verified"},
            "unknownLegacyField":{"preserve":true}
        }))
        .expect("legacy-compatible repair dto");
        assert_eq!(repair.repair_code, "SC-2026-020");
        assert_eq!(
            repair.repair_completion_event.unwrap()["verification"],
            "verified"
        );
        assert_eq!(repair.extra["unknownLegacyField"]["preserve"], true);
        let payload = serde_json::to_value(super::CompleteAssetRepair {
            actual_cost: 1_250_000,
            notes: "Đã nghiệm thu".to_owned(),
        })
        .expect("complete request serialization");
        assert_eq!(payload["actualCost"], 1_250_000);
    }

    #[test]
    fn asset_disposal_wire_contract_keeps_legacy_fields_and_event_provenance() {
        let disposal: super::AssetDisposal = serde_json::from_value(json!({
            "key":"disposal-1",
            "disposalCode":"TL-2026-012",
            "disposalMethod":"Báo mất / Thất lạc do rủi ro",
            "originalCost":"30.000.000",
            "netBookValue":0,
            "status":"Đã thanh lý & Hoàn tất sổ sách",
            "disposalApprovalEvent":{"verification":"user_attested"},
            "unknownLegacyField":{"preserve":true}
        }))
        .expect("legacy-compatible disposal dto");
        assert_eq!(disposal.disposal_code, "TL-2026-012");
        assert_eq!(disposal.disposal_method, "Báo mất / Thất lạc do rủi ro");
        assert_eq!(disposal.original_cost, 30_000_000);
        assert_eq!(disposal.net_book_value, 0);
        assert_eq!(
            disposal.disposal_approval_event.unwrap()["verification"],
            "user_attested"
        );
        assert_eq!(disposal.extra["unknownLegacyField"]["preserve"], true);
        let approval = serde_json::to_value(super::ApproveAssetDisposal {
            actual_disposal_price: 3_700_000,
            security_data_wipe_certified: true,
        })
        .expect("approval request serialization");
        assert_eq!(approval["actualDisposalPrice"], 3_700_000);
        assert_eq!(approval["securityDataWipeCertified"], true);
    }

    #[test]
    fn asset_depreciation_wire_contract_preserves_schedule_and_unknown_legacy_fields() {
        let item: super::AssetDepreciation = serde_json::from_value(json!({
            "key":"deprec-1",
            "assetCode":"TS-SRV-003",
            "assetName":"Cụm máy chủ",
            "originalCost":"360.000.000",
            "residualValue":"10.000.000",
            "lifeMonths":36,
            "depreciatedMonths":1,
            "monthlyDeprec":10000000,
            "yearlyDeprec":120000000,
            "accumulatedDeprec":10000000,
            "netBookValue":350000000,
            "status":"Đang trích khấu hao",
            "scheduleList":[{
                "period":"10/2026","monthNumber":1,"monthlyAmount":10000000,
                "accumulatedAmount":10000000,"remainingAmount":350000000,"posted":true,
                "legacyScheduleCode":"A"
            }],
            "depreciationEvents":[{"period":"2026-10","legacyMarker":true}],
            "legacyOpaqueField":{"preserve":true},
            "_kiyoLegacyImport":{"verification":"unverified"}
        }))
        .expect("legacy-compatible depreciation dto");
        assert_eq!(item.asset_code, "TS-SRV-003");
        assert_eq!(item.original_cost, 360_000_000);
        assert_eq!(item.schedule_list.len(), 1);
        assert!(item.schedule_list[0].posted);
        assert_eq!(item.schedule_list[0].extra["legacyScheduleCode"], "A");
        assert_eq!(item.depreciation_events[0]["legacyMarker"], true);
        assert_eq!(item.extra["legacyOpaqueField"]["preserve"], true);
        assert_eq!(
            item.extra["_kiyoLegacyImport"]["verification"],
            "unverified"
        );

        let create = serde_json::to_value(super::CreateAssetDepreciation {
            asset_code: "TS-SRV-003".to_owned(),
            asset_name: "Cụm máy chủ".to_owned(),
            category: "Máy chủ & Hạ tầng IDC".to_owned(),
            department: "Trung Tâm Dữ Liệu & Cloud (DC)".to_owned(),
            cost_account: "Nợ 6421 (CP Quản lý CNTT)".to_owned(),
            asset_account: "Có 2141 (Hao mòn TSCĐ hữu hình)".to_owned(),
            depreciation_method: "Đường thẳng (Straight-Line VAS TT45)".to_owned(),
            original_cost: 360_000_000,
            residual_value: 10_000_000,
            life_months: 36,
            start_date: "2026-10-01".to_owned(),
            notes: "legacy".to_owned(),
        })
        .expect("create depreciation payload");
        assert_eq!(create["assetCode"], "TS-SRV-003");
        assert_eq!(create["originalCost"], 360_000_000);
        assert_eq!(create["residualValue"], 10_000_000);

        let run = serde_json::to_value(super::RunAssetDepreciation {
            period: "2026-10".to_owned(),
        })
        .expect("run depreciation payload");
        assert_eq!(run["period"], "2026-10");
    }
}
