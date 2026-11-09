import { FileSignature, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { confirmHandoverReceipt } from '../../callapi/beneficiaryApi'
import { RECEIPT_NOTE_LIMIT, receiptErrorMessage, validateReceipt } from '../../utils/beneficiary'
import FileField from '../common/FileField'

// Form xác nhận đã nhận tài sản: POST /api/beneficiary/handovers/{handoverId}/receipt (multipart)
// Bắt buộc đính kèm biên bản xác nhận đã nhận và chữ ký số rời RSA-SHA256 để BE xác thực và cấp biên nhận số
export default function ReceiptConfirmForm({ handoverId, onConfirmed }) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [signature, setSignature] = useState(null)
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState({})
  const [alert, setAlert] = useState('')
  const [busy, setBusy] = useState(false)

  const clearError = (name) => setErrors((current) => ({ ...current, [name]: undefined }))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    const validation = validateReceipt({ note, accepted, file, signature })
    setErrors(validation)
    setAlert('')
    if (Object.keys(validation).length > 0) return
    setBusy(true)
    try {
      const receipt = await confirmHandoverReceipt(handoverId, { note, file, signature })
      onConfirmed(receipt)
    } catch (caught) {
      setAlert(receiptErrorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <form className="d-flex flex-column gap-3" onSubmit={handleSubmit} noValidate aria-label="Xác nhận nhận tài sản">
      <div className="av-info-box d-flex gap-2 fs-12 text-slate-600" style={{ padding: 12 }}>
        <FileSignature size={16} aria-hidden="true" className="flex-shrink-0 mt-1 text-brand" />
        <span>
          Xác nhận nhận tài sản yêu cầu <strong>biên bản xác nhận</strong> và <strong>chữ ký số rời</strong> (RSA-SHA256) của bạn để đối chiếu và ghi vào sổ cái.
        </span>
      </div>

      <FileField
        id={`receipt-file-${handoverId}`}
        label="Biên bản xác nhận đã nhận tài sản"
        hint="Chấp nhận .pdf, .png, .jpg, .txt, tối đa 50 MB."
        accept=".pdf,.png,.jpg,.jpeg,.txt"
        required
        file={file}
        error={errors.file}
        onChange={(value) => {
          setFile(value)
          clearError('file')
        }}
      />

      <FileField
        id={`receipt-signature-${handoverId}`}
        label="Chữ ký số rời"
        hint="File chữ ký RSA-SHA256 dạng nhị phân (.sig), tối đa 16 KB."
        required
        file={signature}
        error={errors.signature}
        onChange={(value) => {
          setSignature(value)
          clearError('signature')
        }}
      />

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
            clearError('note')
          }}
        />
        {errors.note && <p className="av-error">{errors.note}</p>}
      </div>

      <label className="av-terms" htmlFor={`receipt-accept-${handoverId}`}>
        <input
          id={`receipt-accept-${handoverId}`}
          type="checkbox"
          checked={accepted}
          onChange={(event) => {
            setAccepted(event.target.checked)
            clearError('accepted')
          }}
        />
        <span>
          Tôi xác nhận đã nhận đầy đủ tài sản và giấy tờ trong hồ sơ này. Xác nhận có chữ ký số sẽ được ghi nhận vào sổ cái và
          <strong> không thể hoàn tác</strong>.
        </span>
      </label>
      {errors.accepted && <p className="av-error mt-0">{errors.accepted}</p>}

      {alert && <Alert variant="danger" className="av-alert mb-0">{alert}</Alert>}

      <div>
        <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={busy} id={`confirm-receipt-${handoverId}`}>
          <PackageCheck size={16} aria-hidden="true" />
          {busy ? 'Đang xác thực chữ ký...' : 'Ký số & xác nhận đã nhận tài sản'}
        </Button>
      </div>
    </form>
  )
}
