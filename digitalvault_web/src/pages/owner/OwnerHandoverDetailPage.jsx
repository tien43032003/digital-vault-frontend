import { ArrowLeft, ClipboardList, FileText } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { Link, useParams } from 'react-router-dom'
import AppToast from '../../components/common/AppToast'
import MockNotice from '../../components/common/MockNotice'
import HandoverStatusBadge from '../../components/executor/HandoverStatusBadge'
import CancelHandoverModal from '../../components/owner/CancelHandoverModal'
import { useOwnerHandoverDetail } from '../../hooks/useOwnerHandoverDetail'
import { MOCK_MODE } from '../../mocks/mode'
import { vaultLabel } from '../../utils/executor'
import { handoverCode, isCancellableStatus } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'

const CASE_STATUS_LABELS = { Pending: 'Chờ bàn giao', In_Progress: 'Đang chuyển giao', Completed: 'Đã bàn giao', Received: 'Đã nhận', Cancelled: 'Đã hủy' }

function BackLink() {
  return (
    <Link to="/owner/handovers" className="d-inline-flex align-items-center gap-2 fs-13 fw-medium text-slate-600 text-decoration-none">
      <ArrowLeft size={16} aria-hidden="true" />
      Quay lại danh sách hồ sơ
    </Link>
  )
}

// Trang chi tiết một hồ sơ bàn giao của Owner: trạng thái, tài sản và người thụ hưởng, giấy tờ Người thi hành đã nộp
export default function OwnerHandoverDetailPage({ mockMode = MOCK_MODE }) {
  const { requestId } = useParams()
  const { status, error, handover, assetNames, beneficiaryNames, executorName, declineReason, reload } = useOwnerHandoverDetail(requestId)
  const [cancelling, setCancelling] = useState(false)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải hồ sơ bàn giao...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div className="d-flex flex-column gap-3">
        <BackLink />
        <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3 mb-0">
          <span>{error?.status === 404 ? 'Không tìm thấy hồ sơ bàn giao.' : error?.message}</span>
          {error?.status !== 404 && (
            <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
              Thử lại
            </Button>
          )}
        </Alert>
      </div>
    )
  }

  const handleCancelled = () => {
    setToast({ title: `Đã hủy hồ sơ #${handover.requestId}` })
    setCancelling(false)
    reload()
  }

  return (
    <div className="d-flex flex-column gap-4">
      <BackLink />

      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              {handoverCode(handover)}
            </h1>
            <p className="mb-0 fs-12 text-slate-500">{`${vaultLabel(handover.vaultId, handover.vaultName)} · Tạo lúc ${formatDateTime(handover.initiatedAt)}`}</p>
            {handover.executorId && (
              <p className="mb-0 fs-12 text-slate-500">{`Người thi hành: ${executorName ?? `Executor #${handover.executorId}`}`}</p>
            )}
          </div>
        </div>
        <div className="d-flex align-items-center gap-3">
          <HandoverStatusBadge status={handover.status} />
          <Button
            type="button"
            variant="light"
            className="av-btn av-btn-sm border"
            disabled={!isCancellableStatus(handover.status)}
            onClick={() => setCancelling(true)}
          >
            Hủy hồ sơ
          </Button>
        </div>
      </section>

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      {handover.status === 'Declined' && (
        <section className="av-panel d-flex flex-column gap-2" aria-label="Executor đã từ chối">
          <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
            Executor đã từ chối tiếp nhận hồ sơ này
          </h2>
          <p className="mb-0 fs-13 text-slate-600">
            {declineReason ? `Lý do: ${declineReason}` : 'Không tìm thấy lý do của hồ sơ này trong thông báo của bạn.'}
            {handover.declinedAt ? ` Từ chối lúc ${formatDateTime(handover.declinedAt)}.` : ''}
          </p>
          <p className="mb-0 fs-13 text-slate-600">
            Phân công của Executor với kho đã được thu hồi và kho không còn bị khóa. Bạn có thể chọn người thi hành khác rồi tạo hồ sơ bàn giao mới ở mục Hồ sơ bàn giao.
          </p>
        </section>
      )}

      <section className="av-panel d-flex flex-column gap-3" aria-label="Tài sản trong hồ sơ">
        <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
          Tài sản và người thụ hưởng
        </h2>
        {handover.cases.length === 0 ? (
          <p className="av-empty mb-0">Hồ sơ chưa có tài sản nào.</p>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0 fs-13" aria-label="Tài sản trong hồ sơ">
              <thead>
                <tr className="fs-11 text-slate-500">
                  <th scope="col">Tài sản</th>
                  <th scope="col">Người thụ hưởng</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {handover.cases.map((item) => (
                  <tr key={item.handoverId}>
                    <td className="fw-semibold text-ink">{assetNames[item.assetId] ?? `Tài sản #${item.assetId}`}</td>
                    <td>{beneficiaryNames[item.beneficiaryId] ?? `Người thụ hưởng #${item.beneficiaryId}`}</td>
                    <td>{CASE_STATUS_LABELS[item.status] ?? item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="av-panel d-flex flex-column gap-3" aria-label="Giấy tờ đã nộp">
        <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
          Giấy tờ Người thi hành đã nộp
        </h2>
        {handover.documents.length === 0 ? (
          <p className="av-empty mb-0">Người thi hành chưa nộp giấy tờ nào.</p>
        ) : (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {handover.documents.map((document) => (
              <li key={document.documentId} className="d-flex align-items-center gap-2 fs-13">
                <FileText size={16} className="text-slate-400" aria-hidden="true" />
                <span className="fw-medium text-ink">{document.fileName}</span>
                <span className="text-slate-500">{document.fileType}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cancelling && <CancelHandoverModal handover={handover} onClose={() => setCancelling(false)} onCancelled={handleCancelled} />}
      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} />
    </div>
  )
}
