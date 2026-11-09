import { parseServerDate } from './beneficiary'

// Giới hạn độ dài một tin nhắn (BE kiểm tra 1-4000 ký tự)
export const MAX_MESSAGE_LENGTH = 4000
// Chu kỳ hỏi lại tin nhắn mới (ms) khi chưa dùng kết nối thời gian thực
export const CHAT_POLL_MS = 5000

// Khung chat chỉ hiện khi hồ sơ đã tới bước có người thẩm định pháp lý
const CHAT_STATUSES = ['Pending_Legal', 'Additional_Info', 'Approved', 'In_Progress', 'Completed', 'Rejected']

export const canShowChat = (status) => CHAT_STATUSES.includes(status)

const ROLE_LABELS = { Executor: 'Người thi hành', LegalVerifier: 'Người thẩm định' }

export const senderRoleLabel = (role) => ROLE_LABELS[role] ?? role ?? ''

// Chuẩn hoá tin nhắn BE trả về (MessageDto dùng sentAt; tài liệu BE ghi createdAt nên nhận cả hai)
export function normalizeMessage(raw) {
  return {
    messageId: raw.messageId,
    senderId: raw.senderId,
    senderName: raw.senderName ?? '',
    senderRole: raw.senderRole ?? '',
    content: raw.content,
    messageType: raw.messageType ?? 'Text',
    createdAt: raw.createdAt ?? raw.sentAt,
  }
}

// Gộp tin mới vào danh sách hiện có: bỏ trùng theo messageId, sắp cũ trước mới sau.
// Không có tin nào mới thì trả lại đúng mảng cũ để React không vẽ lại.
export function mergeMessages(current, incoming) {
  const known = new Set(current.map((item) => item.messageId))
  const fresh = incoming.filter((item) => !known.has(item.messageId))
  if (fresh.length === 0) return current
  const byMessageId = new Map()
  for (const item of [...current, ...fresh]) byMessageId.set(item.messageId, item)
  return [...byMessageId.values()].sort((a, b) => {
    const diff = parseServerDate(a.createdAt).getTime() - parseServerDate(b.createdAt).getTime()
    return diff !== 0 ? diff : a.messageId - b.messageId
  })
}
