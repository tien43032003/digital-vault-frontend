import { declineReasonFromNotifications } from './handover'

// Các thông báo BE gửi cho mọi cổng (tiêu đề tiếng Anh cố định) và cách hiển thị tiếng Việt.
// body(ctx) dựng nội dung tiếng Việt từ các chi tiết trích được trong nội dung gốc (mã hồ sơ, tên trong ngoặc, tỉ lệ %).
// Tiêu đề lạ giữ nguyên để không mất thông tin.
const ref = (ctx) => (ctx.requestId !== null ? ` #${ctx.requestId}` : '')
const named = (ctx) => (ctx.name ? ` "${ctx.name}"` : '')

const KNOWN = {
  'Executor accepted handover': { title: 'Executor đã tiếp nhận hồ sơ bàn giao', tone: 'ok', body: () => 'Executor được giao đã tiếp nhận hồ sơ bàn giao của bạn.' },
  'Executor declined handover': { title: 'Executor đã từ chối hồ sơ bàn giao', tone: 'warn' },
  'Vault assignment revoked': { title: 'Phân công Executor đã bị thu hồi', tone: 'warn', body: () => 'Phân công Executor của bạn với kho này đã bị thu hồi.' },
  'Vault assigned': { title: 'Bạn được giao làm người thi hành kho', tone: 'info', body: (ctx) => `Chủ sở hữu đã chỉ định bạn làm người thi hành cho kho${named(ctx)}.` },
  'Beneficiary designated': {
    title: 'Bạn được chỉ định là người thụ hưởng',
    tone: 'info',
    body: (ctx) => `Bạn đã được chỉ định là người thụ hưởng${ctx.name ? ` của tài sản "${ctx.name}"` : ''}${ctx.percent ? ` với tỉ lệ phân bổ ${ctx.percent}` : ''}.`,
  },
  'Allocation changed': {
    title: 'Tỉ lệ phân bổ di sản đã thay đổi',
    tone: 'warn',
    body: (ctx) => `Tỉ lệ phân bổ của bạn${ctx.name ? ` đối với tài sản "${ctx.name}"` : ''} đã được cập nhật${ctx.percent ? ` thành ${ctx.percent}` : ''}.`,
  },
  'Handover assigned': { title: 'Có hồ sơ bàn giao mới được giao', tone: 'info', body: (ctx) => `Hồ sơ bàn giao${ref(ctx)} đã được giao cho bạn xử lý.` },
  'Legal review assigned': { title: 'Có hồ sơ mới cần thẩm định pháp lý', tone: 'info', body: (ctx) => `Hồ sơ${ref(ctx)} đã được gửi đến bạn để thẩm định pháp lý.` },
  'Legal review updated': { title: 'Kết quả thẩm định pháp lý đã cập nhật', tone: 'info', body: (ctx) => `Kết quả thẩm định pháp lý của hồ sơ${ref(ctx)} vừa được cập nhật${ctx.status ? `: ${ctx.status}` : ''}.` },
  'Inheritance available': { title: 'Di sản đã sẵn sàng cho bạn', tone: 'ok', body: (ctx) => `Tài sản${named(ctx)} đã sẵn sàng để bàn giao cho bạn. Hãy theo dõi tiến trình bàn giao.` },
  'Handover completed': { title: 'Hồ sơ bàn giao đã hoàn tất', tone: 'ok', body: (ctx) => `Người thi hành đã hoàn tất bàn giao hồ sơ${ref(ctx)}. Vui lòng kiểm tra và xác nhận đã nhận tài sản.` },
  'Receipt confirmed': { title: 'Đã xác nhận nhận tài sản', tone: 'ok', body: (ctx) => `Người thụ hưởng đã xác nhận nhận tài sản của hồ sơ${ref(ctx)} và biên nhận số đã được cấp.` },
}

// Loại thông báo (trường type của BE) hiển thị tiếng Việt
const TYPE_LABELS = {
  Handover: 'Bàn giao',
  Assignment: 'Phân công',
  Beneficiary: 'Thụ hưởng',
  Allocation: 'Phân bổ',
  Inheritance: 'Di sản',
  Legal: 'Pháp lý',
  LegalReview: 'Thẩm định pháp lý',
  Receipt: 'Biên nhận',
  Payment: 'Thanh toán',
  ProofOfLife: 'Xác minh còn sống',
  Security: 'Bảo mật',
  System: 'Hệ thống',
}

export function notificationTypeLabel(type) {
  if (!type) return ''
  return TYPE_LABELS[type] ?? TYPE_LABELS[String(type).replace(/[\s_-]/g, '')] ?? type
}

const HANDOVER_NUMBER = /Handover #(\d+)/i
const QUOTED_NAME = /["'“‘]([^"'”’]{1,120})["'”’]/
const PERCENT = /(\d+(?:[.,]\d+)?)\s*%/
const REVIEW_STATUS = { approved: 'Đã duyệt', rejected: 'Bị từ chối', 'needs info': 'Cần bổ sung', 'needs_info': 'Cần bổ sung', 'more info': 'Cần bổ sung' }

// Thay các cụm tiếng Anh phổ biến trong nội dung lạ để vẫn đọc được bằng tiếng Việt
const vietnamizeMessage = (message) => message.replace(/Handover #(\d+)/gi, 'Hồ sơ #$1')

// Chuẩn hóa một thông báo: tiêu đề và nội dung tiếng Việt, tông màu, mã hồ sơ liên quan (nếu có) để tạo liên kết
export function describeNotification(notification) {
  const rawTitle = (notification?.title ?? '').trim()
  const message = notification?.message ?? ''
  const known = KNOWN[rawTitle]
  const found = HANDOVER_NUMBER.exec(message) ?? HANDOVER_NUMBER.exec(rawTitle)
  const base = { requestId: found ? Number(found[1]) : null, tone: known?.tone ?? 'info', typeLabel: notificationTypeLabel(notification?.type) }

  if (rawTitle === 'Executor declined handover') {
    if (base.requestId === null) return { ...base, title: known.title, body: vietnamizeMessage(message) }
    const reason = declineReasonFromNotifications([notification], base.requestId)
    return { ...base, title: known.title, body: reason ? `Hồ sơ #${base.requestId} bị từ chối. Lý do: ${reason}` : `Hồ sơ #${base.requestId} bị từ chối.` }
  }
  if (known?.body) {
    const statusKey = Object.keys(REVIEW_STATUS).find((key) => message.toLowerCase().includes(key))
    const ctx = {
      requestId: base.requestId,
      name: QUOTED_NAME.exec(message)?.[1]?.trim() ?? null,
      percent: PERCENT.exec(message) ? `${PERCENT.exec(message)[1]}%` : null,
      status: statusKey ? REVIEW_STATUS[statusKey] : null,
    }
    return { ...base, title: known.title, body: known.body(ctx) }
  }
  return { ...base, title: rawTitle || 'Thông báo', body: vietnamizeMessage(message) }
}

// Số thông báo chưa đọc hiển thị trên huy hiệu: ẩn khi 0, gộp từ 100 trở lên thành 99+
export function formatUnreadCount(count) {
  if (!count) return ''
  return count > 99 ? '99+' : String(count)
}

// Thông báo BE gửi cho người thẩm định pháp lý (tiêu đề tiếng Anh): dịch theo từ khóa trong tiêu đề hoặc nội dung. Chưa nhận ra thì giữ nguyên chữ của BE
const LEGAL_RULES = [
  {
    test: /legal verification|verification (request|assign)|assigned.*(verif|review)|needs? (your )?review|pending legal/i,
    title: 'Có hồ sơ mới cần thẩm định pháp lý',
    body: (id) => (id ? `Hồ sơ #${id} đã được gửi đến bạn để thẩm định.` : 'Một hồ sơ bàn giao đã được gửi đến bạn để thẩm định.'),
    tone: 'info',
  },
  {
    test: /additional (information|info|documents?)|resubmit|re-?submitted|supplement/i,
    title: 'Người thi hành đã bổ sung hồ sơ',
    body: (id) => (id ? `Hồ sơ #${id} đã được bổ sung và đang chờ bạn thẩm định lại.` : 'Một hồ sơ đã được bổ sung và đang chờ bạn thẩm định lại.'),
    tone: 'info',
  },
  {
    test: /death certificate|certificate (uploaded|submitted)/i,
    title: 'Giấy chứng tử đã được nộp',
    body: (id) => (id ? `Giấy chứng tử của hồ sơ #${id} đã được nộp.` : 'Một giấy chứng tử mới đã được nộp.'),
    tone: 'info',
  },
  {
    test: /(handover|request).*(cancel)|cancel.*(handover|request)/i,
    title: 'Hồ sơ bàn giao đã bị hủy',
    body: (id) => (id ? `Hồ sơ #${id} đã bị hủy nên không cần thẩm định nữa.` : 'Một hồ sơ bàn giao đã bị hủy.'),
    tone: 'warn',
  },
]

// Chuẩn hóa một thông báo của người thẩm định: tiêu đề và nội dung tiếng Việt, tông màu, mã hồ sơ liên quan (nếu có) để tạo liên kết.
// Nội dung chưa dịch được vẫn được "Việt hóa" phần mã hồ sơ ("Handover #12" thành "Hồ sơ #12").
export function describeLegalNotification(notification) {
  const rawTitle = notification.title ?? ''
  const message = notification.message ?? ''
  const found = HANDOVER_NUMBER.exec(message) ?? HANDOVER_NUMBER.exec(rawTitle)
  const requestId = found ? Number(found[1]) : null
  const rule = LEGAL_RULES.find((item) => item.test.test(`${rawTitle} ${message}`))
  if (rule) return { title: rule.title, body: rule.body(requestId), tone: rule.tone, requestId }
  return { title: rawTitle || 'Thông báo hệ thống', body: message.replace(/Handover #(\d+)/gi, 'Hồ sơ #$1'), tone: 'info', requestId }
}
