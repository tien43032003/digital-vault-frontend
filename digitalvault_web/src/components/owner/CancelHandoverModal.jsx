import { ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { cancelHandover } from '../../callapi/ownerApi'
import { vaultLabel } from '../../utils/executor'
import { handoverCode } from '../../utils/handover'

function cancelErrorMessage(error) {
  if (error?.status === 409) return 'Chỉ hủy được hồ sơ đang chờ Executor tiếp nhận, bản nháp hoặc bị từ chối.'
  if (error?.status === 404) return 'Không tìm thấy hồ sơ bàn giao. Vui lòng tải lại trang.'
  if (error?.status === 403) return 'Bạn không có quyền hủy hồ sơ này.'
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// Hộp thoại xác nhận hủy hồ sơ bàn giao; chỉ mount khi mở
export default function CancelHandoverModal({ handover, onClose, onCancelled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    if (!busy) onClose()
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    try {
      await cancelHandover(handover.requestId)
      onCancelled()
    } catch (caught) {
      setBusy(false)
      setError(cancelErrorMessage(caught))
    }
  }

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="cancel-handover-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <ShieldAlert size={20} aria-hidden="true" />
          </span>
          <h2 id="cancel-handover-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            Hủy Hồ Sơ Bàn Giao
          </h2>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <div className="av-modal-body d-flex flex-column gap-3">
        <p className="mb-0 fs-13 text-slate-600">
          {`Bạn sắp hủy hồ sơ ${handoverCode(handover)} của ${vaultLabel(handover.vaultId, handover.vaultName)}. Người thi hành sẽ phải tạo hồ sơ mới nếu muốn bàn giao lại; sau khi hủy bạn có thể chỉnh sửa tài sản, phân bổ và giấy tờ của kho như bình thường.`}
        </p>
        {error && <Alert variant="danger" className="av-alert mb-0">{error}</Alert>}
      </div>

      <div className="av-modal-foot justify-content-end gap-2">
        <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
          Quay lại
        </Button>
        <Button type="button" variant="danger" onClick={handleConfirm} disabled={busy} className="av-btn av-btn-md">
          {busy ? 'Đang xử lý dữ liệu...' : 'Xác nhận hủy'}
        </Button>
      </div>
    </Modal>
  )
}
