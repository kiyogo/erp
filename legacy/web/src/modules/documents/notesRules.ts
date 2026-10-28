export const NOTE_CATEGORIES = [
  'Ý kiến chỉ đạo BGĐ',
  'Giao ban tuần & Tháng',
  'Biên bản cuộc họp HĐQT',
  'Ghi nhớ dự án & Kỹ thuật',
  'Chỉ đạo đột xuất',
] as const;

export const NOTE_PRIORITIES = ['Khẩn cấp P1', 'Ưu tiên cao P2', 'Bình thường P3'] as const;

export interface NoteActionItem {
  id: number;
  text: string;
  done: boolean;
}

export interface MeetingDirectiveNote {
  key: string;
  noteCode: string;
  title: string;
  category: typeof NOTE_CATEGORIES[number] | string;
  priority: typeof NOTE_PRIORITIES[number] | string;
  author: string;
  authorRole: string;
  assignedToDept: string;
  deadline: string;
  createdDate: string;
  createdBy?: string;
  createdById?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedById?: string;
  completedAt?: string;
  isPinned: boolean;
  completionRate: number;
  content: string;
  actionItems: NoteActionItem[];
  history?: Array<{ action: string; actor: string; actorId: string; at: string }>;
  reminderHistory?: Array<{ actor: string; actorId: string; at: string; recipientCount: number }>;
  status: 'Đang thực hiện' | 'Đã hoàn thành' | 'Cần đẩy nhanh' | 'Quá hạn' | string;
}

export function vietnamBusinessDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function noteCompletionRate(actionItems: NoteActionItem[]): number {
  const items = Array.isArray(actionItems) ? actionItems.filter((item) => item && typeof item === 'object') : [];
  if (!items.length) return 0;
  return Math.round(items.filter((item) => item.done === true).length * 100 / items.length);
}

export function noteStatus(note: Pick<MeetingDirectiveNote, 'actionItems' | 'deadline' | 'status'>, today = vietnamBusinessDate()): string {
  const rate = noteCompletionRate(note.actionItems || []);
  if (rate === 100) return 'Đã hoàn thành';
  if (note.deadline && note.deadline < today) return 'Quá hạn';
  if (note.status === 'Cần đẩy nhanh') return note.status;
  return 'Đang thực hiện';
}

export function formatNoteDate(value?: string): string {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}

export function formatNoteTimestamp(value?: string): string {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

export function parseNoteActionItems(rawText: string): NoteActionItem[] {
  const tasks = rawText.split(/\r?\n/).map((text) => text.trim()).filter(Boolean);
  if (tasks.length === 0) throw new Error('Vui lòng nhập ít nhất một đầu việc cụ thể.');
  if (tasks.length > 50) throw new Error('Mỗi chỉ đạo được tạo tối đa 50 đầu việc.');
  return tasks.map((text, index) => ({ id: index + 1, text, done: false }));
}

export function noteExportRows(notes: MeetingDirectiveNote[]) {
  return [
    ['Mã chỉ đạo', 'Tiêu đề', 'Phân loại', 'Ưu tiên', 'Người chỉ đạo', 'Chức danh', 'Đơn vị thực thi', 'Ngày ban hành', 'Hạn chót', 'Trạng thái', 'Tiến độ (%)', 'Ghim ưu tiên', 'Nội dung', 'Đầu việc', 'Số lần nhắc'],
    ...notes.map((note) => {
      const actionItems = Array.isArray(note.actionItems) ? note.actionItems.filter((item) => item && typeof item === 'object') : [];
      return [
      note.noteCode,
      note.title,
      note.category,
      note.priority,
      note.author,
      note.authorRole,
      note.assignedToDept,
      note.createdDate,
      note.deadline,
      noteStatus(note),
      noteCompletionRate(note.actionItems || []),
      note.isPinned ? 'Có' : 'Không',
      note.content,
      actionItems.map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`).join('\n'),
      note.reminderHistory?.length ?? 0,
      ];
    }),
  ];
}
