import { declineReasonFromNotifications } from './handover'

// Các thông báo BE gửi (tiêu đề tiếng Anh cố định hoặc đã Việt hóa) và cách hiển thị tiếng Việt; tiêu đề lạ giữ nguyên để không mất thông tin
const KNOWN = {
  'Executor accepted handover': {
    title: 'Executor đã tiếp nhận hồ sơ bàn giao',
    body: 'Executor được giao đã tiếp nhận hồ sơ bàn giao của bạn.',
    tone: 'ok',
  },
  'Executor declined handover': { title: 'Executor đã từ chối hồ sơ bàn giao', tone: 'warn' },
  'Vault assignment revoked': {
    title: 'Phân công Executor đã bị thu hồi',
    body: 'Phân công Executor của bạn với kho này đã bị thu hồi.',
    tone: 'warn',
  },
  'Vault assigned': {
    title: 'Kho được giao cho Executor',
    defaultEnglishMessage: 'An Owner assigned you to a vault. Review your assignments for the handover workflow.',
    defaultBody: 'Một chủ sở hữu đã phân công bạn làm Người thi hành cho kho di sản. Vui lòng kiểm tra danh sách phân công để xử lý quy trình bàn giao khi cần.',
    tone: 'info',
  },
  'Beneficiary designated': {
    title: 'Bạn đã được chỉ định làm người thụ hưởng',
    body: 'Một chủ sở hữu kho di sản đã chỉ định bạn làm người thụ hưởng tài sản số. Quyền truy cập sẽ được mở sau khi hồ sơ bàn giao được duyệt pháp lý và xác thực danh tính.',
    tone: 'info',
  },
  'Allocation changed': {
    title: 'Tỷ lệ phân bổ tài sản đã thay đổi',
    body: 'Chủ sở hữu kho đã cập nhật hoặc thu hồi tỷ lệ phân bổ tài sản số của bạn.',
    tone: 'info',
  },
  'Handover assigned': {
    title: 'Có hồ sơ bàn giao mới được giao cho bạn',
    body: 'Một hồ sơ bàn giao di sản đã được giao cho bạn xử lý.',
    tone: 'info',
  },
  'Legal review assigned': {
    title: 'Có hồ sơ mới cần thẩm định pháp lý',
    body: 'Một hồ sơ bàn giao di sản đang chờ bạn thẩm định pháp lý độc lập.',
    tone: 'info',
  },
  'Legal review updated': {
    title: 'Đã có kết quả thẩm định pháp lý',
    body: 'Hồ sơ bàn giao bạn phụ trách đã có kết quả thẩm định pháp lý. Vui lòng kiểm tra chi tiết hồ sơ.',
    tone: 'info',
  },
  'Inheritance available': {
    title: 'Di sản thừa kế đã sẵn sàng',
    body: 'Hồ sơ bàn giao di sản đã được duyệt pháp lý. Vui lòng xác thực danh tính để kiểm tra tài sản thừa kế được phân bổ cho bạn.',
    tone: 'ok',
  },
  'Handover completed': {
    title: 'Bàn giao di sản đã hoàn tất',
    body: 'Người thi hành đã hoàn tất bàn giao di sản của bạn. Vui lòng kiểm tra tài sản thừa kế và xác nhận đã nhận.',
    tone: 'ok',
  },
  'Receipt confirmed': {
    title: 'Người thụ hưởng đã xác nhận nhận di sản',
    body: 'Người thụ hưởng đã xác nhận nhận đầy đủ tài sản từ hồ sơ bàn giao.',
    tone: 'ok',
  },
}

const TYPE_LABELS = {
  Allocation: 'Phân bổ',
  Handover: 'Bàn giao',
  Assignment: 'Phân công',
  Inheritance: 'Thừa kế',
  LegalReview: 'Pháp lý',
  Receipt: 'Biên nhận',
  ProofOfLife: 'Điểm danh',
}

export function notificationTypeLabel(type) {
  return TYPE_LABELS[type] ?? type
}

const HANDOVER_NUMBER = /(?:Handover|Hồ sơ) #(\d+)/i

// Chuẩn hóa một thông báo: tiêu đề và nội dung tiếng Việt, tông màu, mã hồ sơ liên quan (nếu có) để tạo liên kết
export function describeNotification(notification) {
  const rawTitle = notification.title ?? ''
  const message = notification.message ?? ''
  const known = KNOWN[rawTitle]
  const requestId = HANDOVER_NUMBER.exec(message)?.[1] ?? null
  const base = { requestId: requestId === null ? null : Number(requestId), tone: known?.tone ?? 'info' }

  if (rawTitle === 'Executor declined handover' && base.requestId !== null) {
    const reason = declineReasonFromNotifications([notification], base.requestId)
    return { ...base, title: known.title, body: reason ? `Hồ sơ #${base.requestId} bị từ chối. Lý do: ${reason}` : `Hồ sơ #${base.requestId} bị từ chối.` }
  }
  if (known?.body) return { ...base, title: known.title, body: known.body }
  if (known?.defaultBody && message === known.defaultEnglishMessage) {
    return { ...base, title: known.title, body: known.defaultBody }
  }
  return { ...base, title: known?.title ?? (rawTitle || 'Thông báo'), body: message }
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

// Thông báo BE gửi cho Executor, trong đó có kết quả thẩm định pháp lý (tiêu đề tiếng Anh): dịch theo từ khóa trong tiêu đề hoặc nội dung.
// Chưa nhận ra thì giữ nguyên chữ của BE (chỉ Việt hóa "Handover #12" thành "Hồ sơ #12") để không mất thông tin
const EXECUTOR_RULES = [
  { test: /additional (information|info|documents?)|supplement/i, title: 'Pháp lý yêu cầu bổ sung hồ sơ', tone: 'warn' },
  { test: /reject/i, title: 'Pháp lý đã từ chối hồ sơ', tone: 'warn' },
  { test: /approv/i, title: 'Pháp lý đã duyệt hồ sơ', tone: 'ok' },
]

export function describeExecutorNotification(notification) {
  const rawTitle = notification.title ?? ''
  const message = notification.message ?? ''
  const found = HANDOVER_NUMBER.exec(message) ?? HANDOVER_NUMBER.exec(rawTitle)
  const requestId = found ? Number(found[1]) : null
  const rule = EXECUTOR_RULES.find((item) => item.test.test(`${rawTitle} ${message}`))
  const body = message.replace(/Handover #(\d+)/gi, 'Hồ sơ #$1')
  if (rule) return { title: rule.title, body, tone: rule.tone, requestId }
  const generic = describeNotification(notification)
  return { ...generic, requestId: generic.requestId ?? requestId, body: generic.body.replace(/Handover #(\d+)/gi, 'Hồ sơ #$1') }
}
