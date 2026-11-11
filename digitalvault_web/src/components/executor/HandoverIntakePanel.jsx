import { ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from 'react-bootstrap'
import DeclineHandoverModal from './DeclineHandoverModal'

// Khung quyết định cho hồ sơ đang chờ Executor tiếp nhận: Chấp nhận (sang bản nháp) hoặc Từ chối kèm lý do.
export default function HandoverIntakePanel({ requestId, busy, onAccept, onDecline }) {
  const [declining, setDeclining] = useState(false)

  return (
    <section className="av-panel d-flex flex-column gap-3" aria-label="Quyết định tiếp nhận">
      <div>
        <h2 className="mb-1 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
          <ClipboardCheck size={16} aria-hidden="true" />
          Hồ sơ đang chờ bạn tiếp nhận
        </h2>
        <p className="mb-0 fs-13 text-slate-600">
          Chủ kho đã giao hồ sơ này cho bạn. Chấp nhận để bắt đầu nộp giấy tờ, bằng chứng và gửi thẩm định; hoặc từ chối kèm lý do nếu không thể đảm nhận. Mỗi hồ sơ chỉ quyết định được một lần.
        </p>
      </div>
      <div className="d-flex flex-wrap gap-2">
        <Button type="button" variant="primary" className="av-btn av-btn-md" disabled={busy} onClick={onAccept}>
          {busy ? 'Đang xử lý...' : 'Chấp nhận'}
        </Button>
        <Button type="button" variant="light" className="av-btn av-btn-md border" disabled={busy} onClick={() => setDeclining(true)}>
          Từ chối tiếp nhận
        </Button>
      </div>
      {declining && (
        <DeclineHandoverModal
          requestId={requestId}
          onClose={() => setDeclining(false)}
          onSubmit={async (reason) => {
            await onDecline(reason)
            setDeclining(false)
          }}
        />
      )}
    </section>
  )
}
