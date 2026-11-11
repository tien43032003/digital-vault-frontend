import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { getLegalVerifiers } from '../../callapi/executorApi'
import { validateLegalRequest } from '../../utils/validators'
import FileField from '../common/FileField'
import TextField from '../common/TextField'

const EMPTY = { verifierId: '', comment: '', evidence: null, signature: null }

// Form gửi hồ sơ cho người xác minh pháp lý. Danh sách người xác minh do BE trả theo hồ sơ (đã loại người xung đột lợi ích).
// onSubmit nhận { verifierId, comment, evidence, signature }; lỗi ném ra đã là thông báo tiếng Việt.
export default function LegalVerificationForm({ requestId, onSubmit }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [busy, setBusy] = useState(false)
  const [verifiers, setVerifiers] = useState({ status: 'loading', items: [] })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getLegalVerifiers(requestId)
      .then((items) => {
        if (!cancelled) setVerifiers({ status: 'ready', items })
      })
      .catch(() => {
        if (!cancelled) setVerifiers({ status: 'error', items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [requestId, reloadKey])

  const reloadVerifiers = useCallback(() => {
    setVerifiers({ status: 'loading', items: [] })
    setReloadKey((key) => key + 1)
  }, [])

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const nextErrors = validateLegalRequest(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setBusy(true)
    try {
      await onSubmit({ verifierId: Number(form.verifierId), comment: form.comment, evidence: form.evidence, signature: form.signature })
    } catch (error) {
      setSubmitError(error.message)
      setBusy(false)
    }
  }

  const noVerifier = verifiers.status === 'ready' && verifiers.items.length === 0

  return (
    <section className="av-panel d-flex flex-column gap-3" aria-label="Gửi thẩm định pháp lý">
      <div>
        <h2 className="mb-1 fw-bold text-ink" style={{ fontSize: 16 }}>
          Gửi thẩm định pháp lý
        </h2>
        <p className="mb-0 fs-12 text-slate-500">
          Giấy chứng tử không bắt buộc. Người xác minh phải độc lập với bạn, chủ kho và người thụ hưởng.
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="d-flex flex-column gap-3">
        <div>
          <label htmlFor="legal-verifier" className="av-label mb-2">
            Người xác minh pháp lý
            <span className="ms-1 text-danger"> *</span>
          </label>
          <Form.Select
            id="legal-verifier"
            disabled={busy || verifiers.status !== 'ready' || noVerifier}
            isInvalid={Boolean(errors.verifierId)}
            aria-describedby={errors.verifierId ? 'legal-verifier-error' : undefined}
            value={form.verifierId}
            onChange={(event) => setField('verifierId', event.target.value)}
          >
            <option value="">{verifiers.status === 'loading' ? 'Đang tải danh sách...' : 'Chọn người xác minh'}</option>
            {verifiers.items.map((verifier) => (
              <option key={verifier.userId} value={verifier.userId}>
                {verifier.fullName}
              </option>
            ))}
          </Form.Select>
          {errors.verifierId && (
            <p id="legal-verifier-error" className="av-error">
              {errors.verifierId}
            </p>
          )}
          {verifiers.status === 'loading' && (
            <p role="status" className="mt-2 mb-0 fs-12 text-slate-500">
              Đang tải danh sách người xác minh...
            </p>
          )}
          {verifiers.status === 'error' && (
            <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3 mt-2 mb-0">
              <span>Không tải được danh sách người xác minh.</span>
              <Button type="button" variant="light" size="sm" className="border" onClick={reloadVerifiers}>
                Thử lại
              </Button>
            </Alert>
          )}
          {noVerifier && <p className="av-empty mt-2 mb-0">Hiện chưa có người xác minh pháp lý phù hợp. Vui lòng liên hệ quản trị viên.</p>}
        </div>
        <TextField
          id="legal-comment"
          name="comment"
          label="Ghi chú"
          as="textarea"
          rows={3}
          disabled={busy}
          inputClassName="av-textarea"
          placeholder="Ghi chú cho người xác minh (không bắt buộc)"
          value={form.comment}
          onChange={(event) => setField('comment', event.target.value)}
          error={errors.comment}
        />
        <FileField
          id="legal-evidence"
          label="Bằng chứng gửi kèm"
          hint="PDF, PNG, JPEG hoặc TXT, tối đa 10 MB."
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          required
          file={form.evidence}
          error={errors.evidence}
          onChange={(file) => setField('evidence', file)}
        />
        <FileField
          id="legal-signature"
          label="Chữ ký số rời"
          hint="File chữ ký RSA-SHA256 dạng nhị phân (.sig), tối đa 16 KB."
          required
          file={form.signature}
          error={errors.signature}
          onChange={(file) => setField('signature', file)}
        />
        {submitError && <Alert variant="danger" className="av-alert mb-0">{submitError}</Alert>}
        <div>
          <Button type="submit" variant="primary" className="av-btn av-btn-md" disabled={busy || noVerifier}>
            {busy ? 'Đang gửi...' : 'Gửi thẩm định'}
          </Button>
        </div>
      </form>
    </section>
  )
}
