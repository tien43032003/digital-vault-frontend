import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { createAdminUser } from '../../callapi/adminApi'
import { adminErrorMessage, ALL_ROLES, extractUserFieldError, roleLabel, validateAdminUser } from '../../utils/admin'
import TextField from '../common/TextField'

const EMPTY_FORM = { fullName: '', email: '', password: '', phone: '', identityNumber: '', roles: [] }

// Hộp thoại Admin tạo tài khoản người dùng với các vai trò chọn sẵn; chỉ mount khi mở
export default function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const toggleRole = (role) => {
    setForm((prev) => ({ ...prev, roles: prev.roles.includes(role) ? prev.roles.filter((item) => item !== role) : [...prev.roles, role] }))
    setErrors((prev) => ({ ...prev, roles: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateAdminUser(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    try {
      const user = await createAdminUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
        identityNumber: form.identityNumber.trim() || null,
        roles: form.roles,
      })
      onCreated(user)
    } catch (caught) {
      setBusy(false)
      const fieldError = extractUserFieldError(caught)
      if (fieldError) setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
      setSubmitError(adminErrorMessage(caught))
    }
  }

  const handleClose = () => {
    if (!busy) onClose()
  }

  return (
    <Modal show onHide={handleClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="create-user-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <UserPlus size={20} aria-hidden="true" />
          </span>
          <h2 id="create-user-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            Thêm Người Dùng
          </h2>
        </div>
        <button type="button" onClick={handleClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="av-modal-body d-flex flex-column gap-3">
          <TextField id="admin-user-name" name="fullName" label="Họ và tên" required value={form.fullName} onChange={handleChange} error={errors.fullName} />
          <TextField id="admin-user-email" name="email" type="email" label="Email" required value={form.email} onChange={handleChange} error={errors.email} />
          <TextField
            id="admin-user-password"
            name="password"
            type="password"
            label="Mật khẩu"
            required
            autoComplete="new-password"
            placeholder="Tối thiểu 12 ký tự"
            value={form.password}
            onChange={handleChange}
            error={errors.password}
          />
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <TextField id="admin-user-phone" name="phone" label="Số điện thoại" value={form.phone} onChange={handleChange} error={errors.phone} />
            </div>
            <div className="col-12 col-md-6">
              <TextField id="admin-user-identity" name="identityNumber" label="Số CCCD" value={form.identityNumber} onChange={handleChange} error={errors.identityNumber} />
            </div>
          </div>
          <fieldset>
            <legend className="av-label mb-2">
              Vai trò<span className="ms-1 text-danger"> *</span>
            </legend>
            <div className="d-flex flex-wrap gap-3">
              {ALL_ROLES.map((role) => (
                <Form.Check
                  key={role}
                  type="checkbox"
                  id={`create-role-${role}`}
                  label={roleLabel(role)}
                  checked={form.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
              ))}
            </div>
            {errors.roles && <p className="av-error">{errors.roles}</p>}
          </fieldset>
          {submitError && <Alert variant="danger" className="av-alert mb-0">{submitError}</Alert>}
        </div>

        <div className="av-modal-foot justify-content-end gap-2">
          <Button type="button" variant="light" onClick={handleClose} disabled={busy} className="av-btn av-btn-md border">
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={busy} className="av-btn av-btn-md">
            {busy ? 'Đang tạo...' : 'Tạo người dùng'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
