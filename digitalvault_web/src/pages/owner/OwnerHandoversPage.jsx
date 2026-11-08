import { ClipboardList, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import AppToast from '../../components/common/AppToast'
import MockNotice from '../../components/common/MockNotice'
import HandoverStatusBadge from '../../components/executor/HandoverStatusBadge'
import CancelHandoverModal from '../../components/owner/CancelHandoverModal'
import CreateOwnerHandoverModal from '../../components/owner/CreateOwnerHandoverModal'
import { useOwnerHandovers } from '../../hooks/useOwnerHandovers'
import { MOCK_MODE } from '../../mocks/mode'
import { vaultLabel } from '../../utils/executor'
import { filterHandovers, handoverCode, isCancellableStatus } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'


// Trang "Hồ sơ bàn giao" của Owner: tạo hồ sơ bàn giao cho kho, xem hồ sơ của kho và hủy khi còn là nháp/bị từ chối
export default function OwnerHandoversPage({ mockMode = MOCK_MODE }) {
  const { status, error, handovers, reload } = useOwnerHandovers()
  const [cancelling, setCancelling] = useState(null)
  const [creating, setCreating] = useState(false)
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
      <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3">
        <span>{error}</span>
        <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
          Thử lại
        </Button>
      </Alert>
    )
  }

  const handleCreated = (request) => {
    setToast({ title: `Đã tạo hồ sơ #${request.requestId}`, detail: 'Hồ sơ ở trạng thái nháp, Người thi hành sẽ nộp giấy chứng tử để tiếp tục.' })
    setCreating(false)
    reload()
  }

  const handleCancelled = () => {
    setToast({ title: `Đã hủy hồ sơ #${cancelling.requestId}` })
    setCancelling(null)
    reload()
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <ClipboardList size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Hồ sơ bàn giao
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Hồ sơ bàn giao di sản của bạn, do bạn hoặc Người thi hành tạo.</p>
          </div>
        </div>
        <Button type="button" variant="primary" className="av-btn av-btn-sm" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" />
          Tạo hồ sơ bàn giao
        </Button>
      </section>

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      <p className="av-notice mb-0">
        Khi kho đang có hồ sơ bàn giao (chưa hủy), bạn không thể sửa tài sản, phân bổ người thụ hưởng hay giấy tờ. Hãy hủy hồ sơ nháp hoặc bị từ chối để mở khóa.
      </p>

      <section className="av-panel" aria-label="Danh sách hồ sơ">
        {handovers.length === 0 ? (
          <p className="av-empty mb-0">Kho của bạn chưa có hồ sơ bàn giao nào.</p>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0 fs-13" aria-label="Danh sách hồ sơ bàn giao">
              <thead>
                <tr className="fs-11 text-slate-500">
                  <th scope="col">Mã hồ sơ</th>
                  <th scope="col">Kho</th>
                  <th scope="col">Ngày tạo</th>
                  <th scope="col">Người thi hành</th>
                  <th scope="col">Phạm vi</th>
                  <th scope="col">Giấy tờ</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">
                    <span className="visually-hidden">Hành động</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filterHandovers(handovers).map((item) => (
                  <tr key={item.requestId}>
                    <td className="fw-semibold text-ink">
                      <Link to={`/owner/handovers/${item.requestId}`} className="text-ink">{handoverCode(item)}</Link>
                    </td>
                    <td>{vaultLabel(item.vaultId, item.vaultName)}</td>
                    <td className="text-nowrap">{formatDateTime(item.initiatedAt)}</td>
                    <td>{item.executorName ?? (item.executorId ? `Executor #${item.executorId}` : '—')}</td>
                    <td>{`${new Set(item.cases.map((entry) => entry.assetId)).size} tài sản`}</td>
                    <td>{`${item.documents.length} giấy tờ`}</td>
                    <td>
                      <HandoverStatusBadge status={item.status} />
                    </td>
                    <td className="text-end">
                      <button type="button" className="av-ghost-btn" disabled={!isCancellableStatus(item.status)} onClick={() => setCancelling(item)}>
                        Hủy hồ sơ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && <CreateOwnerHandoverModal mockMode={mockMode} onClose={() => setCreating(false)} onCreated={handleCreated} />}
      {cancelling && <CancelHandoverModal handover={cancelling} onClose={() => setCancelling(null)} onCancelled={handleCancelled} />}
      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} />
    </div>
  )
}
