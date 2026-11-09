import { http, HttpResponse } from 'msw'
import { getDb, saveDb } from './db'
import { hasUnknownFields, problem, route } from './helpers'

// Mock khung chat hồ sơ bàn giao, bám ChatController của BE: chỉ Executor và LegalVerifier, tin nhắn mới nhất trước
const CHAT_ROLES = ['Executor', 'LegalVerifier']
const MAX_LENGTH = 4000

const messages = () => {
  const db = getDb()
  db.handoverMessages ??= []
  return db.handoverMessages
}

// DTO trả ra không có requestId (chỉ dùng nội bộ để lọc theo hồ sơ)
const toDto = (message) => {
  const dto = { ...message }
  delete dto.requestId
  return dto
}

// Như BE: sai role thì 403
function chatMember(userId) {
  const account = getDb().users.find((user) => user.userId === userId)
  if (!account?.roles.some((role) => CHAT_ROLES.includes(role))) return null
  return account
}

export const chatHandlers = [
  http.get(
    '*/api/handovers/:requestId/messages',
    route(({ request, params, userId }) => {
      if (!chatMember(userId)) return problem(403, 'Bạn không có quyền xem lịch sử tin nhắn của đơn bàn giao này.')
      const query = new URL(request.url).searchParams
      const page = Number(query.get('page') ?? 1)
      const pageSize = Number(query.get('pageSize') ?? 20)
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return problem(400, 'page >= 1; pageSize must be 1-100.')
      const requestId = Number(params.requestId)
      const all = messages()
        .filter((item) => item.requestId === requestId)
        .sort((a, b) => b.messageId - a.messageId)
      return HttpResponse.json({ page, pageSize, items: all.slice((page - 1) * pageSize, page * pageSize).map(toDto) })
    }),
  ),

  http.post(
    '*/api/handovers/:requestId/messages',
    route(({ params, userId, body }) => {
      const sender = chatMember(userId)
      if (!sender) return problem(403, 'Bạn không có quyền gửi tin nhắn trong đơn bàn giao này.')
      if (hasUnknownFields(body, ['content', 'messageType'])) return problem(400, 'Unknown field.')
      const content = typeof body?.content === 'string' ? body.content.trim() : ''
      if (content.length < 1 || content.length > MAX_LENGTH) return problem(400, 'Nội dung tin nhắn phải từ 1 đến 4000 ký tự.')
      const list = messages()
      const requestId = Number(params.requestId)
      const message = {
        messageId: list.reduce((max, item) => Math.max(max, item.messageId), 0) + 1,
        requestId,
        conversationId: requestId,
        senderId: sender.userId,
        senderName: sender.fullName,
        senderRole: sender.roles.find((role) => CHAT_ROLES.includes(role)),
        content,
        messageType: body?.messageType ?? 'Text',
        sentAt: new Date().toISOString(),
      }
      list.push(message)
      saveDb()
      return HttpResponse.json(toDto(message))
    }),
  ),
]
