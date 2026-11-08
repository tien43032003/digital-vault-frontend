import { Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { deleteInactivePlans } from '../../callapi/adminApi'
import { adminPlanErrorMessage } from '../../utils/payment'

// Hộp thoại xác nhận xóa hàng loạt mọi gói đã ngừng bán (DELETE /admin/subscription-plans/inactive).
// Gói đã có giao dịch hoặc người đăng ký được máy chủ bỏ qua; kết quả hiện ngay trong hộp thoại rồi mới đóng.
export default function DeleteInactivePlansModal({ count, onClose, onFinished }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleClose = () => {
    if (busy) return
    if (result) onFinished(result)
    else onClose()
  }

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await deleteInactivePlans())
    } catch (caught) {
      setError(adminPlanErrorMessage(caught, 'delete-permanent'))
    } finally {
      setBusy(false)
    }
  }

  const skipped = result?.skippedPlanIds?.length ?? 0

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal av-modal-sm" aria-labelledby="delete-inactive-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <Trash2 size={20} aria-hidden="true" />
          </span>
          <h2 id="delete-inactive-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            Xóa Tất Cả Gói Ngừng Bán
          </h2>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <div className="av-modal-body d-flex flex-column gap-3">
        {result ? (
          <div role="status" className="d-flex flex-column gap-2">
            <p className="mb-0 fs-14 text-ink fw-semibold">{`Đã xóa ${result.deletedCount} gói.`}</p>
            {skipped > 0 && (
              <p className="mb-0 fs-13 text-slate-600">{`${skipped} gói được giữ lại vì đã có giao dịch hoặc người đăng ký.`}</p>
            )}
            {result.message && <p className="mb-0 fs-12 text-slate-500">{result.message}</p>}
          </div>
        ) : (
          <p className="mb-0 fs-14 text-slate-600">
            Bạn chắc chắn muốn xóa vĩnh viễn <strong className="text-ink">{`${count} gói`}</strong> đang ở nhóm "Ngừng bán"? Thao tác này không thể hoàn tác. Gói đã có giao dịch hoặc người đăng ký sẽ được giữ lại.
          </p>
        )}
        {error && <Alert variant="danger" className="av-alert mb-0">{error}</Alert>}
      </div>

      <div className="av-modal-foot justify-content-end gap-2">
        {result ? (
          <Button type="button" variant="primary" onClick={handleClose} className="av-btn av-btn-md">
            Đóng
          </Button>
        ) : (
          <>
            <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
              Hủy
            </Button>
            <Button type="button" variant="danger" onClick={handleConfirm} disabled={busy} className="av-btn av-btn-md">
              {busy ? 'Đang xóa...' : 'Xóa tất cả'}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
