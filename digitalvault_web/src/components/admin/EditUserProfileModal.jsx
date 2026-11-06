import { UserCog, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Modal } from 'react-bootstrap'
import { updateAdminUser } from '../../callapi/adminApi'
import { adminErrorMessage, extractUserFieldError, validateAdminProfile } from '../../utils/admin'
import TextField from '../common/TextField'

// Hộp thoại Admin sửa họ tên, điện thoại và CCCD của một người dùng (email và vai trò sửa ở nơi khác); chỉ mount khi mở
export default function EditUserProfileModal({ user, onClose, onSaved }) {
  const initial = { fullName: user.fullName, phone: user.phone ?? '', identityNumber: user.identityNumber ?? '' }
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  const changed = Object.keys(initial).some((key) => form[key].trim() !== initial[key].trim())

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleClose = () => {
    if (!busy) onClose()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateAdminProfile(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    try {
      onSaved(await updateAdminUser(user.userId, form))
    } catch (caught) {
      setBusy(false)
      const fieldError = extractUserFieldError(caught)
      if (fieldError) setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
      setSubmitError(adminErrorMessage(caught))
    }
  }

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="edit-profile-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <UserCog size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 id="edit-profile-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
              Sửa Thông Tin Người Dùng
            </h2>
            <p className="mb-0 fs-12 text-slate-500">{user.email}</p>
          </div>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="av-modal-body d-flex flex-column gap-3">
          <TextField id="profile-name" name="fullName" label="Họ và tên" required value={form.fullName} onChange={handleChange} error={errors.fullName} />
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <TextField id="profile-phone" name="phone" label="Số điện thoại" value={form.phone} onChange={handleChange} error={errors.phone} />
            </div>
            <div className="col-12 col-md-6">
              <TextField id="profile-identity" name="identityNumber" label="Số CCCD" value={form.identityNumber} onChange={handleChange} error={errors.identityNumber} />
            </div>
          </div>
          {submitError && <Alert variant="danger" className="av-alert mb-0">{submitError}</Alert>}
        </div>

        <div className="av-modal-foot justify-content-end gap-2">
          <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !changed} className="av-btn av-btn-md">
            {busy ? 'Đang lưu...' : 'Lưu thông tin'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
