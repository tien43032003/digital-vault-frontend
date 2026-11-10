import { Download, HeartPulse } from 'lucide-react'
import { proofOfLifeStatusLabel, formatDateTime } from '../../utils/proofOfLife'

// Trạng thái chủ kho của BE (OwnerLifeStatusDto.status): nhãn tiếng Việt và màu; giá trị lạ giữ nguyên chữ của BE
const STATUS_INFO = {
  Active: { text: 'Đang hoạt động', tone: 'av-badge-ok' },
  Warning: { text: 'Cảnh báo', tone: 'av-badge-caution' },
  Triggered: { text: 'Đã kích hoạt', tone: 'av-badge-warn' },
  ConfirmedDeceased: { text: 'Đã xác nhận qua đời', tone: 'av-badge-warn' },
}
const statusInfo = (status) => STATUS_INFO[status] ?? { text: proofOfLifeStatusLabel(status), tone: 'av-badge-muted' }

const dateOrDash = (value) => (value ? formatDateTime(value) : '—')

function Field({ label, children }) {
  return (
    <div>
      <dt className="av-stat-label">{label.toUpperCase()}</dt>
      <dd className="mb-0 fs-13 text-ink">{children}</dd>
    </div>
  )
}

// Khối "Tình trạng chủ kho" của hồ sơ thẩm định (owner-status): trạng thái sống, giấy chứng tử và xác minh
export default function OwnerStatusCard({ status, certificateName = null, onDownloadDeathCertificate, downloading = false }) {
  if (!status) return null
  const hasCertificate = status.deathCertificateDocumentId != null

  return (
    <section className="av-panel d-flex flex-column gap-3" aria-label="Tình trạng chủ kho">
      <h2 className="mb-0 fw-bold text-ink fs-15 d-flex align-items-center gap-2">
        <HeartPulse size={18} className="text-brand" aria-hidden="true" />
        Tình trạng chủ kho
      </h2>
      <dl className="mb-0 row g-3">
        <div className="col-12 col-md-6 col-xl-3">
          <Field label="Chủ kho">{status.fullName ?? '—'}</Field>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <Field label="Trạng thái">
            {status.status ? <span className={`av-badge ${statusInfo(status.status).tone}`}>{statusInfo(status.status).text}</span> : '—'}
          </Field>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <Field label="Xác nhận còn sống gần nhất">{dateOrDash(status.lastConfirmedAliveAt)}</Field>
        </div>
        <div className="col-12 col-md-6 col-xl-3">
          <Field label="Thời điểm xác minh">{dateOrDash(status.verifiedAt)}</Field>
        </div>
        <div className="col-12">
          <Field label="Giấy chứng tử">
            {hasCertificate ? (
              <span className="d-inline-flex align-items-center gap-2 flex-wrap">
                <span>{certificateName ? `${certificateName} (tài liệu #${status.deathCertificateDocumentId})` : `Tài liệu #${status.deathCertificateDocumentId}`}</span>
                <button type="button" className="av-ghost-btn is-brand" disabled={downloading} onClick={() => onDownloadDeathCertificate?.(status.deathCertificateDocumentId)}>
                  <Download size={14} aria-hidden="true" />
                  {downloading ? 'Đang tải...' : 'Tải giấy chứng tử'}
                </button>
              </span>
            ) : (
              'Không có giấy chứng tử (không bắt buộc)'
            )}
          </Field>
        </div>
      </dl>
    </section>
  )
}
