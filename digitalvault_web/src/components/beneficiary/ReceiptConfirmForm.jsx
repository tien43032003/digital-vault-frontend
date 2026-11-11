import { PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { confirmHandoverReceipt } from '../../callapi/beneficiaryApi'
import { RECEIPT_NOTE_LIMIT, receiptErrorMessage, validateReceipt } from '../../utils/beneficiary'
import FileField from '../common/FileField'

// Form xác nhận đã nhận tài sản: POST /api/beneficiary/handovers/{handoverId}/receipt (multipart: File, Signature bắt buộc, Note tuỳ chọn)
export default function ReceiptConfirmForm({ handoverId, onConfirmed }) {
  const [note, setNote] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [files, setFiles] = useState({ file: null, signature: null })
  const [errors, setErrors] = useState({})
  const [alert, setAlert] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    const validation = validateReceipt({ note, accepted, ...files })
    setErrors(validation)
    setAlert('')
    if (Object.keys(validation).length > 0) return
    setBusy(true)
    try {
      const receipt = await confirmHandoverReceipt(handoverId, { note, ...files })
      onConfirmed(receipt)
    } catch (caught) {
      setAlert(receiptErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <form className="d-flex flex-column gap-3" onSubmit={handleSubmit} noValidate aria-label="Xác nhận nhận tài sản">
      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <label htmlFor={`receipt-note-${handoverId}`} className="av-label">
            Ghi chú khi nhận (không bắt buộc)
          </label>
          <span className="fs-11 text-slate-400">{`${note.length}/${RECEIPT_NOTE_LIMIT}`}</span>
        </div>
        <Form.Control
          as="textarea"
          rows={3}
          id={`receipt-note-${handoverId}`}
          className="av-input av-textarea"
          placeholder="Ví dụ: Đã nhận đủ khóa truy cập và giấy tờ gốc, không có sai sót."
          value={note}
          maxLength={RECEIPT_NOTE_LIMIT + 50}
          isInvalid={Boolean(errors.note)}
          onChange={(event) => {
            setNote(event.target.value)
            setErrors((current) => ({ ...current, note: undefined }))
          }}
        />
        {errors.note && <p className="av-error">{errors.note}</p>}
      </div>

      <FileField
        id={`receipt-file-${handoverId}`}
        label="Tệp xác nhận nhận tài sản"
        hint="PDF, PNG, JPEG hoặc TXT, tối đa 10 MB."
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        required
        file={files.file}
        error={errors.file}
        onChange={(file) => {
          setFiles((current) => ({ ...current, file }))
          setErrors((current) => ({ ...current, file: undefined }))
        }}
      />
      <FileField
        id={`receipt-signature-${handoverId}`}
        label="Chữ ký số rời"
        hint="File chữ ký RSA-SHA256 dạng nhị phân (.sig), tối đa 16 KB."
        required
        file={files.signature}
        error={errors.signature}
        onChange={(signature) => {
          setFiles((current) => ({ ...current, signature }))
          setErrors((current) => ({ ...current, signature: undefined }))
        }}
      />

      <label className="av-terms" htmlFor={`receipt-accept-${handoverId}`}>
        <input
          id={`receipt-accept-${handoverId}`}
          type="checkbox"
          checked={accepted}
          onChange={(event) => {
            setAccepted(event.target.checked)
            setErrors((current) => ({ ...current, accepted: undefined }))
          }}
        />
        <span>
          Tôi xác nhận đã nhận đầy đủ tài sản và giấy tờ trong hồ sơ này. Xác nhận sẽ được ghi nhận vào sổ cái và
          <strong> không thể hoàn tác</strong>.
        </span>
      </label>
      {errors.accepted && <p className="av-error mt-0">{errors.accepted}</p>}

      {alert && <Alert variant="danger" className="av-alert mb-0">{alert}</Alert>}

      <div>
        <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={busy} id={`confirm-receipt-${handoverId}`}>
          <PackageCheck size={16} aria-hidden="true" />
          {busy ? 'Đang ghi nhận...' : 'Xác nhận đã nhận tài sản'}
        </Button>
      </div>
    </form>
  )
}
