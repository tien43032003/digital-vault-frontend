import { MessageSquare, Send } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { AuthContext } from '../../contexts/authContextInstance'
import { useHandoverChat } from '../../hooks/useHandoverChat'
import { CHAT_POLL_MS, MAX_MESSAGE_LENGTH, senderRoleLabel } from '../../utils/chat'
import { formatDateTime } from '../../utils/proofOfLife'

// Khung trao đổi giữa Executor và người thẩm định trong cùng một hồ sơ bàn giao.
// counterpart: cách gọi người ở đầu bên kia ("người thẩm định" / "người thi hành") để hiện gợi ý.
export default function HandoverChatPanel({ requestId, currentUserId: userIdProp, counterpart, pollMs = CHAT_POLL_MS }) {
  // Không truyền currentUserId thì lấy người đang đăng nhập (đọc context trực tiếp để dùng được cả ngoài AuthProvider)
  const auth = useContext(AuthContext)
  const currentUserId = userIdProp ?? auth?.user?.userId
  const { status, error, messages, sending, sendError, send, reload } = useHandoverChat(requestId, { pollMs })
  const [text, setText] = useState('')
  const listRef = useRef(null)

  // Có tin mới thì cuộn xuống cuối danh sách
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages])

  const submit = async () => {
    if (sending || !text.trim()) return
    if (await send(text)) setText('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    submit()
  }

  // Enter gửi tin, Shift+Enter xuống dòng
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <section className="av-panel d-flex flex-column gap-3" aria-label="Trao đổi hồ sơ bàn giao">
      <h2 className="mb-0 fw-bold text-ink fs-15 d-flex align-items-center gap-2">
        <MessageSquare size={18} className="text-brand" aria-hidden="true" />
        Trao đổi hồ sơ bàn giao
      </h2>

      {status === 'loading' && (
        <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500 mb-0">
          <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
          Đang tải tin nhắn...
        </p>
      )}

      {status === 'error' && (
        <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3 mb-0">
          <span>{error}</span>
          <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      )}

      {status === 'ready' && (
        <>
          {messages.length === 0 ? (
            <p className="av-empty mb-0 fs-13 text-slate-500 py-3">{`Chưa có tin nhắn nào. Hãy bắt đầu trao đổi với ${counterpart} về hồ sơ này.`}</p>
          ) : (
            <div ref={listRef} role="log" aria-label="Tin nhắn" aria-live="polite" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                {messages.map((message) => {
                  const own = message.senderId === currentUserId
                  return (
                    <li key={message.messageId} className={`d-flex flex-column ${own ? 'align-items-end' : 'align-items-start'}`}>
                      <p className="mb-1 fs-11 text-slate-500">
                        <span className="fw-semibold text-ink">{own ? 'Bạn' : message.senderName}</span>
                        {!own && message.senderRole && ` · ${senderRoleLabel(message.senderRole)}`}
                        {` · ${formatDateTime(message.createdAt)}`}
                      </p>
                      <p
                        className={`mb-0 px-3 py-2 rounded-3 fs-13 ${own ? 'bg-primary-subtle text-ink' : 'bg-light text-ink'}`}
                        style={{ maxWidth: '85%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                      >
                        {message.content}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <Form onSubmit={handleSubmit} className="d-flex flex-column gap-2" noValidate>
            <Form.Control
              as="textarea"
              rows={2}
              aria-label="Nội dung tin nhắn"
              placeholder="Nhập tin nhắn (Enter để gửi, Shift+Enter để xuống dòng)"
              maxLength={MAX_MESSAGE_LENGTH}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {sendError && (
              <Alert variant="danger" className="av-alert mb-0" role="alert">
                {sendError}
              </Alert>
            )}
            <div className="d-flex align-items-center justify-content-between gap-2">
              <span className="fs-11 text-slate-500">{`${text.length}/${MAX_MESSAGE_LENGTH}`}</span>
              <Button type="submit" variant="primary" className="av-btn av-btn-sm" disabled={sending || !text.trim()}>
                <Send size={14} aria-hidden="true" />
                {sending ? 'Đang gửi...' : 'Gửi'}
              </Button>
            </div>
          </Form>
        </>
      )}
    </section>
  )
}
