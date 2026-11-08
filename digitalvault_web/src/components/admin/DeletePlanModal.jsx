import { Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { deleteAdminPlan } from '../../callapi/adminApi'
import { adminPlanErrorMessage } from '../../utils/payment'

// Hộp thoại xác nhận Admin xóa một gói dịch vụ: gói đang bán thì chuyển sang ngừng bán, gói đã ngừng bán thì xóa vĩnh viễn
export default function DeletePlanModal({ plan, onClose, onDeleted }) {
  const permanent = !plan.isActive
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleClose = () => {
    if (!busy) onClose()
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    try {
      if (permanent) await deleteAdminPlan(plan.planId, { permanent: true })
      else await deleteAdminPlan(plan.planId)
      onDeleted(plan)
    } catch (caught) {
      setBusy(false)
      setError(adminPlanErrorMessage(caught, permanent ? 'delete-permanent' : 'delete'))
    }
  }

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal av-modal-sm" aria-labelledby="delete-plan-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <Trash2 size={20} aria-hidden="true" />
          </span>
          <h2 id="delete-plan-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            {permanent ? 'Xóa Vĩnh Viễn Gói Dịch Vụ' : 'Xóa Gói Dịch Vụ'}
          </h2>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>
      <div className="av-modal-body d-flex flex-column gap-3">
        <p className="mb-0 fs-14 text-slate-600">
          {permanent ? (
            <>
              Bạn chắc chắn muốn xóa vĩnh viễn gói <strong className="text-ink">{plan.planName}</strong>? Gói sẽ bị xóa khỏi hệ thống và không thể bán lại. Nếu gói đã có giao dịch hoặc người đăng ký, máy chủ có thể từ chối hoặc chỉ giữ gói ở nhóm "Ngừng bán".
            </>
          ) : (
            <>
              Bạn chắc chắn muốn xóa gói <strong className="text-ink">{plan.planName}</strong>? Gói sẽ ngừng bán và ẩn khỏi người dùng; lịch sử giao dịch của gói vẫn được giữ. Bạn có thể bật bán lại sau ở nhóm "Ngừng bán".
            </>
          )}
        </p>
        {error && <Alert variant="danger" className="av-alert mb-0">{error}</Alert>}
      </div>
      <div className="av-modal-foot justify-content-end gap-2">
        <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
          Hủy
        </Button>
        <Button type="button" variant="danger" onClick={handleConfirm} disabled={busy} className="av-btn av-btn-md">
          {busy ? 'Đang xóa...' : permanent ? 'Xóa vĩnh viễn' : 'Xóa gói'}
        </Button>
      </div>
    </Modal>
  )
}
