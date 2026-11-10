import { PackagePlus, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { createAsset } from '../../callapi/ownerApi'
import { ASSET_TYPE_LABELS } from '../../utils/catalog'
import { conflictMessage } from '../../utils/ownerErrors'
import { validateAsset } from '../../utils/validators'
import TextField from '../common/TextField'

const EMPTY_FORM = { name: '', type: '', description: '' }

// Chuyển lỗi API tạo tài sản sang thông báo tiếng Việt
function createAssetErrorMessage(error) {
  if (error?.status === 404) return 'Không tìm thấy kho. Vui lòng tải lại trang.'
  // 409 do hồ sơ bàn giao khóa kho khác với kho ngưng hoạt động nên phải giải thích đúng lý do
  if (error?.status === 409) {
    return /handover/i.test(error.message ?? '') ? conflictMessage(error.message) : 'Kho này đang không hoạt động. Vui lòng chọn kho khác.'
  }
  if (error?.status === 400) return 'Thông tin tài sản không hợp lệ. Vui lòng kiểm tra lại.'
  return error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.'
}

// Modal thêm tài sản vào kho đang chọn; onCreated nhận tài sản vừa tạo từ BE.
// Người thi hành không chọn ở đây: Owner chỉ định ở mục Người thi hành hoặc khi tạo hồ sơ bàn giao.
export default function AddAssetModal({ open, vault, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateAsset(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const asset = await createAsset({ vaultId: vault.vaultId, ...form })
      setForm(EMPTY_FORM)
      onCreated(asset)
    } catch (error) {
      setSubmitError(createAssetErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal show={open} onHide={onClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="add-asset-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <PackagePlus size={20} aria-hidden="true" />
          </span>
          <div>
            <span className="av-modal-tag av-mono-tag">DIGITAL ASSET</span>
            <h2 id="add-asset-title" className="mt-1 mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
              Thêm Tài Sản Số Mới
            </h2>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="av-modal-body d-flex flex-column gap-4">
          <p className="mb-0 fs-12 text-slate-500">
            Lưu vào kho: <strong className="text-ink">{vault?.name}</strong>
          </p>
          <TextField
            id="asset-name"
            name="name"
            label="Tên tài sản"
            required
            placeholder="Ví dụ: Tài khoản tiết kiệm Vietcombank"
            value={form.name}
            onChange={handleChange}
            error={errors.name}
          />

          <div>
            <div className="mb-2">
              <label htmlFor="asset-type" className="av-label">
                Loại tài sản
                <span className="ms-1 text-danger"> *</span>
              </label>
            </div>
            <Form.Select
              id="asset-type"
              name="type"
              value={form.type}
              onChange={handleChange}
              isInvalid={Boolean(errors.type)}
              aria-invalid={errors.type ? 'true' : undefined}
              aria-describedby={errors.type ? 'asset-type-error' : undefined}
              className="av-input"
            >
              <option value="">Chọn loại tài sản</option>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
            {errors.type && (
              <p id="asset-type-error" className="av-error">
                {errors.type}
              </p>
            )}
          </div>

          <TextField
            id="asset-description"
            name="description"
            label="Mô tả"
            as="textarea"
            rows={3}
            placeholder="Thông tin mô tả tài sản (không bắt buộc)"
            value={form.description}
            onChange={handleChange}
            inputClassName="av-textarea"
            error={errors.description}
          />

          {submitError && <Alert variant="danger" className="av-alert">{submitError}</Alert>}
        </div>

        <div className="av-modal-foot justify-content-end gap-2">
          <Button type="button" variant="light" onClick={onClose} className="av-btn av-btn-md border">
            Hủy
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting} className="av-btn av-btn-md">
            {isSubmitting ? 'Đang lưu...' : 'Lưu tài sản'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
