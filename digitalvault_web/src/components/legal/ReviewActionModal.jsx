import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import {
  approveLegalHandover,
  rejectLegalHandover,
  requestAdditionalInfoLegalHandover,
} from '../../callapi/legalApi'
import { validateHandoverDocument } from '../../utils/validators'
import FileField from '../common/FileField'

const CONFIGS = {
  approve: {
    title: 'Phê duyệt hồ sơ bàn giao',
    icon: CheckCircle2,
    iconColor: 'text-success',
    badgeText: 'Duyệt hồ sơ',
    submitVariant: 'success',
    submitText: 'Xác nhận duyệt',
    description:
      'Hồ sơ đã đầy đủ điều kiện pháp lý. Sau khi phê duyệt, hồ sơ sẽ chuyển sang trạng thái Đã duyệt pháp lý (Approved) để Người thi hành bắt đầu quy trình bàn giao tài sản.',
    placeholder: 'Nhập nhận xét / căn cứ phê duyệt hồ sơ pháp lý...',
    requiresFiles: true,
    fileLabel: 'Tệp văn bản thẩm định (quyết định duyệt)',
    api: approveLegalHandover,
  },
  reject: {
    title: 'Từ chối / Yêu cầu bổ sung hồ sơ bàn giao',
    icon: XCircle,
    iconColor: 'text-danger',
    badgeText: 'Từ chối hồ sơ',
    submitVariant: 'danger',
    submitText: 'Xác nhận gửi cho Người thi hành',
    description:
      'Từ chối hồ sơ hoặc yêu cầu Người thi hành bổ sung giấy tờ, bằng chứng. Hồ sơ sẽ chuyển sang trạng thái Bị từ chối (Rejected); Người thi hành thấy lý do để nộp bổ sung và gửi thẩm định lại.',
    placeholder: 'Nêu rõ lý do từ chối hoặc các giấy tờ/bằng chứng yêu cầu Người thi hành bổ sung...',
    requiresFiles: true,
    fileLabel: 'Tệp văn bản thẩm định (quyết định từ chối)',
    api: rejectLegalHandover,
  },
  'additional-info': {
    title: 'Yêu cầu bổ sung thông tin hồ sơ',
    icon: AlertCircle,
    iconColor: 'text-warning',
    badgeText: 'Yêu cầu bổ sung',
    submitVariant: 'warning',
    submitText: 'Gửi yêu cầu bổ sung',
    description:
      'Yêu cầu Người thi hành nộp thêm giấy tờ, bằng chứng hoặc thông tin làm rõ. Hồ sơ sẽ chuyển sang trạng thái Cần bổ sung hồ sơ (Additional_Info).',
    placeholder: 'Liệt kê cụ thể các giấy tờ, tài liệu hoặc thông tin cần bổ sung...',
    api: requestAdditionalInfoLegalHandover,
  },
}

const MIN_LENGTH = 1
const MAX_LENGTH = 2000
const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.txt'

export default function ReviewActionModal({ show, type, requestId, onClose, onSuccess }) {
  const [comment, setComment] = useState('')
  const [validationError, setValidationError] = useState('')
  const [files, setFiles] = useState({ file: null, signature: null })
  const [fileErrors, setFileErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const config = CONFIGS[type] || CONFIGS.approve
  const Icon = config.icon

  const handleCommentChange = (event) => {
    const value = event.target.value
    setComment(value)
    if (validationError) setValidationError('')
  }

  const setFile = (name, value) => {
    setFiles((prev) => ({ ...prev, [name]: value }))
    setFileErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setApiError('')

    const trimmed = comment.trim()
    if (trimmed.length < MIN_LENGTH) {
      setValidationError('Vui lòng nhập nhận xét / căn cứ thẩm định (tối thiểu 1 ký tự).')
      return
    }

    if (trimmed.length > MAX_LENGTH) {
      setValidationError(`Nhận xét không được vượt quá ${MAX_LENGTH} ký tự (hiện tại: ${trimmed.length}).`)
      return
    }

    // Duyệt / Từ chối bắt buộc kèm tệp quyết định và chữ ký số rời (.sig)
    if (config.requiresFiles) {
      const errors = validateHandoverDocument(files, { signatureRequired: true })
      if (Object.keys(errors).length > 0) {
        setFileErrors(errors)
        return
      }
    }

    setSubmitting(true)
    try {
      const reviewDto = await config.api(requestId, config.requiresFiles ? { comment: trimmed, ...files } : { comment: trimmed })
      onSuccess(reviewDto)
    } catch (error) {
      setApiError(error?.message || 'Đã có lỗi xảy ra khi thực hiện thao tác.')
    } finally {
      setSubmitting(false)
    }
  }

  const trimmedLength = comment.trim().length
  const isOverLimit = trimmedLength > MAX_LENGTH

  return (
    <Modal show={show} onHide={submitting ? undefined : onClose} centered backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!submitting} className="border-bottom-0 pb-0">
          <div className="d-flex align-items-center gap-2">
            <Icon size={22} className={config.iconColor} aria-hidden="true" />
            <Modal.Title as="h2" className="fs-16 fw-bold text-ink mb-0">
              {config.title}
            </Modal.Title>
          </div>
        </Modal.Header>

        <Modal.Body className="d-flex flex-column gap-3 pt-3">
          <p className="fs-13 text-slate-600 mb-0" style={{ lineHeight: 1.5 }}>
            {config.description}
          </p>

          <Form.Group controlId="legal-review-comment">
            <div className="d-flex align-items-center justify-content-between mb-1">
              <Form.Label className="fs-12 fw-semibold text-ink mb-0">
                Nhận xét / Ý kiến thẩm định <span className="text-danger">*</span>
              </Form.Label>
              <span
                className={`fs-11 ${
                  isOverLimit ? 'text-danger fw-bold' : trimmedLength === 0 ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {trimmedLength}/{MAX_LENGTH} ký tự
              </span>
            </div>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder={config.placeholder}
              value={comment}
              onChange={handleCommentChange}
              disabled={submitting}
              isInvalid={Boolean(validationError) || isOverLimit}
              className="fs-13"
              style={{ resize: 'vertical' }}
              autoFocus
            />
            {validationError && (
              <Form.Control.Feedback type="invalid" className="fs-12">
                {validationError}
              </Form.Control.Feedback>
            )}
          </Form.Group>

          {config.requiresFiles && (
            <>
              <FileField
                id="legal-review-file"
                label={config.fileLabel}
                hint="PDF, PNG, JPEG hoặc TXT, tối đa 10 MB."
                accept={DOCUMENT_ACCEPT}
                required
                file={files.file}
                error={fileErrors.file}
                onChange={(file) => setFile('file', file)}
              />
              <FileField
                id="legal-review-signature"
                label="Chữ ký số rời (.sig)"
                hint="File chữ ký RSA-SHA256 dạng nhị phân, tối đa 16 KB."
                required
                file={files.signature}
                error={fileErrors.signature}
                onChange={(file) => setFile('signature', file)}
              />
            </>
          )}

          {apiError && (
            <Alert variant="danger" className="av-alert mb-0 py-2 fs-12">
              {apiError}
            </Alert>
          )}
        </Modal.Body>

        <Modal.Footer className="border-top-0 pt-0">
          <Button type="button" variant="light" className="border fs-13" disabled={submitting} onClick={onClose}>
            Hủy bỏ
          </Button>
          <Button type="submit" variant={config.submitVariant} className="fs-13 fw-semibold" disabled={submitting}>
            {submitting ? 'Đang xử lý...' : config.submitText}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  )
}
