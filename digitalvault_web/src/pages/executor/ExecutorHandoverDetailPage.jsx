import { ArrowLeft, Download, FileText, Lock, ShieldCheck } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { Link, useParams } from 'react-router-dom'
import {
  acceptHandover,
  completeHandover,
  declineHandover,
  downloadHandoverDocument,
  requestLegalVerification,
  simulateLegalApproval,
  startHandover,
  uploadDeathCertificate,
  uploadEvidence,
} from '../../callapi/executorApi'
import AppToast from '../../components/common/AppToast'
import DocumentUploadForm from '../../components/executor/DocumentUploadForm'
import HandoverIntakePanel from '../../components/executor/HandoverIntakePanel'
import HandoverStatusBadge from '../../components/executor/HandoverStatusBadge'
import HandoverChatPanel from '../../components/handover/HandoverChatPanel'
import LegalVerificationForm from '../../components/executor/LegalVerificationForm'
import { useHandover } from '../../hooks/useHandover'
import { useVaultName } from '../../hooks/useVaultName'
import { MOCK_MODE } from '../../mocks/mode'
import { formatAllocation } from '../../utils/catalog'
import { downloadBlob } from '../../utils/download'
import { handoverOwnerName, vaultLabel } from '../../utils/executor'
import { canShowChat } from '../../utils/chat'
import { documentSubmittedLabel, handoverActionErrorMessage, handoverCode, isEditableStatus } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'

const CASE_STATUS_LABELS = { Pending: 'Chờ bàn giao', In_Progress: 'Đang chuyển giao', Completed: 'Đã bàn giao', Received: 'Đã nhận' }

function BackLink() {
  return (
    <Link to="/executor/orders" className="d-inline-flex align-items-center gap-2 fs-13 fw-medium text-slate-600 text-decoration-none">
      <ArrowLeft size={16} aria-hidden="true" />
      Quay lại đơn bàn giao
    </Link>
  )
}

// Chuyển lỗi thành Error có thông báo tiếng Việt để các form hiển thị trực tiếp
const toActionError = (action) => (error) => {
  throw new Error(handoverActionErrorMessage(error, action))
}

// Trang chi tiết một hồ sơ bàn giao: tài sản, giấy tờ và các thao tác theo trạng thái
export default function ExecutorHandoverDetailPage({ mockMode = MOCK_MODE }) {
  const { requestId } = useParams()
  const { status, error, handover, refresh } = useHandover(requestId)
  const vaultName = useVaultName(handover?.vaultId)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState('')

  const notify = (title, detail) => setToast({ title, detail })

  // Chạy một thao tác (bắt đầu, mô phỏng duyệt) và báo lỗi tiếng Việt ngay trên trang
  const runAction = async (action, work, successTitle) => {
    setActionBusy(true)
    setActionError('')
    try {
      await work()
      notify(successTitle)
      refresh()
    } catch (caught) {
      setActionError(handoverActionErrorMessage(caught, action))
    } finally {
      setActionBusy(false)
    }
  }

  // Quyết định tiếp nhận: gặp 409 (hồ sơ đã đổi trạng thái) thì tải lại để màn hình khớp với máy chủ; lỗi được ném lại dạng tiếng Việt
  const decide = async (action, work, successTitle) => {
    setActionBusy(true)
    setActionError('')
    try {
      await work()
      notify(successTitle)
      refresh()
    } catch (caught) {
      if (caught?.status === 409) refresh()
      throw new Error(handoverActionErrorMessage(caught, action), { cause: caught })
    } finally {
      setActionBusy(false)
    }
  }

  const handleAccept = () => decide('accept', () => acceptHandover(handover.requestId), 'Đã tiếp nhận hồ sơ').catch((caught) => setActionError(caught.message))
  const handleDecline = (reason) => decide('decline', () => declineHandover(handover.requestId, reason), 'Đã từ chối hồ sơ')

  const submitFile = (upload, successTitle) => async (input) => {
    await upload(handover.requestId, input).catch(toActionError('upload'))
    notify(successTitle)
    refresh()
  }

  const handleDownload = async (document) => {
    setDownloadingId(document.documentId)
    setDownloadError('')
    try {
      const { blob, signatureValid } = await downloadHandoverDocument(handover.requestId, document.documentId)
      downloadBlob(document.fileName, blob)
      notify(`Đã tải xuống ${document.fileName}`, signatureValid ? undefined : 'Tệp chưa có chữ ký hợp lệ để đối chiếu.')
    } catch (caught) {
      const reason = caught?.status === 404 ? 'Không tìm thấy giấy tờ.' : caught?.message
      setDownloadError(`Không tải được ${document.fileName}. ${reason ?? ''}`.trim())
    } finally {
      setDownloadingId(null)
    }
  }

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải hồ sơ bàn giao...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <div className="d-flex flex-column gap-3">
        <BackLink />
        <Alert variant="danger" className="av-alert">
          {error?.status === 404 ? 'Không tìm thấy hồ sơ bàn giao.' : error?.message}
        </Alert>
      </div>
    )
  }

  const editable = isEditableStatus(handover.status)

  return (
    <div className="d-flex flex-column gap-4">
      <BackLink />

      <section className="av-panel d-flex flex-wrap align-items-start justify-content-between gap-3">
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              {handoverCode(handover)}
            </h1>
            <HandoverStatusBadge status={handover.status} />
          </div>
          <p className="mt-2 mb-0 fs-12 text-slate-500 d-flex flex-wrap gap-2">
            <span>{vaultLabel(handover.vaultId, vaultName)}</span>
            {handoverOwnerName(handover) && (
              <>
                <span aria-hidden="true">·</span>
                <span>{`Chủ kho: ${handoverOwnerName(handover)}`}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{`Tạo lúc ${formatDateTime(handover.initiatedAt)}`}</span>
          </p>
        </div>
      </section>

      {actionError && <Alert variant="danger" className="av-alert mb-0">{actionError}</Alert>}

      {(handover.status === 'Rejected' || handover.status === 'Additional_Info') && (
        <Alert variant={handover.status === 'Rejected' ? 'danger' : 'warning'} className="av-alert mb-0">
          <div className="fw-bold mb-1">
            {handover.status === 'Rejected' ? 'Hồ sơ bị Pháp lý từ chối / Yêu cầu bổ sung' : 'Pháp lý yêu cầu bổ sung thông tin'}
            {handover.legalVerifierName ? ` (Người thẩm định: ${handover.legalVerifierName})` : ''}
          </div>
          <div>
            <strong>Lý do / Yêu cầu từ Pháp lý:</strong>{' '}
            {handover.legalComment || 'Vui lòng kiểm tra lại giấy tờ chứng tử và bằng chứng pháp lý rồi gửi thẩm định lại.'}
          </div>
          {handover.legalReviewedAt && <div className="fs-11 text-slate-500 mt-1">Thời gian phản hồi: {formatDateTime(handover.legalReviewedAt)}</div>}
        </Alert>
      )}

      {handover.status === 'Pending_Executor' && (
        <HandoverIntakePanel requestId={handover.requestId} busy={actionBusy} onAccept={handleAccept} onDecline={handleDecline} />
      )}
      {handover.status === 'Declined' && <p className="av-notice mb-0">Bạn đã từ chối tiếp nhận hồ sơ này. Hồ sơ chỉ còn để xem lại.</p>}

      <div className="row g-4">
        <section className="col-12 col-xl-7">
          <div className="av-panel d-flex flex-column gap-3 h-100">
            <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
              Tài sản và người thụ hưởng
            </h2>
            {handover.cases.length === 0 ? (
              <p className="av-empty mb-0">Hồ sơ chưa có tài sản nào.</p>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0 fs-13" aria-label="Tài sản và người thụ hưởng">
                  <thead>
                    <tr className="fs-11 text-slate-500">
                      <th scope="col">Tài sản</th>
                      <th scope="col">Người thụ hưởng</th>
                      <th scope="col" className="text-end">Tỉ lệ phân bổ</th>
                      <th scope="col">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handover.cases.map((item) => (
                      <tr key={item.handoverId}>
                        <td>{item.assetName ?? `Tài sản #${item.assetId}`}</td>
                        <td>{item.beneficiaryName ?? `Người thụ hưởng #${item.beneficiaryId}`}</td>
                        <td className="text-end fw-semibold text-ink">{item.allocationPercentage == null ? '—' : formatAllocation(item.allocationPercentage)}</td>
                        <td>{CASE_STATUS_LABELS[item.status] ?? item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="col-12 col-xl-5">
          <div className="av-panel d-flex flex-column gap-3 h-100">
            <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
              Giấy tờ của hồ sơ
            </h2>
            {downloadError && <Alert variant="danger" className="av-alert mb-0">{downloadError}</Alert>}
            {handover.documents.length === 0 ? (
              <p className="av-empty mb-0">Chưa có giấy tờ nào trong hồ sơ.</p>
            ) : (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2" aria-label="Giấy tờ của hồ sơ">
                {handover.documents.map((document) => (
                  <li key={document.documentId} className="av-doc-item">
                    <span className="av-stat-icon">
                      <FileText size={16} aria-hidden="true" />
                    </span>
                    <div className="av-doc-main">
                      <p className="mb-0 fs-13 fw-semibold text-ink text-truncate">{document.fileName}</p>
                      {documentSubmittedLabel(document) && <p className="mb-0 fs-11 text-slate-500">{documentSubmittedLabel(document)}</p>}
                    </div>
                    {document.isEncrypted && (
                      <span className="av-badge av-badge-ok">
                        <Lock size={10} aria-hidden="true" />
                        Đã mã hóa
                      </span>
                    )}
                    <button type="button" className="av-ghost-btn" disabled={downloadingId !== null} onClick={() => handleDownload(document)}>
                      <Download size={14} aria-hidden="true" />
                      {downloadingId === document.documentId ? 'Đang tải...' : 'Tải về'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {editable && (
        <>
          <DocumentUploadForm
            idPrefix="death-certificate"
            title="Nộp giấy chứng tử"
            description="Không bắt buộc: có thể nộp để hỗ trợ thẩm định, không nộp vẫn gửi thẩm định được. Chỉ Người thi hành được phân công mới nộp được."
            fileLabel="Giấy chứng tử"
            submitLabel="Nộp giấy chứng tử"
            onSubmit={submitFile(uploadDeathCertificate, 'Đã nộp giấy chứng tử')}
          />
          <DocumentUploadForm
            idPrefix="evidence"
            title="Nộp bằng chứng bổ sung"
            description="Tài liệu bổ sung hồ sơ khi được yêu cầu hoặc để hỗ trợ thẩm định."
            fileLabel="Tệp bằng chứng"
            submitLabel="Nộp bằng chứng"
            onSubmit={submitFile(uploadEvidence, 'Đã nộp bằng chứng')}
          />
          <LegalVerificationForm
            requestId={handover.requestId}
            onSubmit={async (input) => {
              await requestLegalVerification(handover.requestId, input).catch(toActionError('legal'))
              notify('Đã gửi hồ sơ thẩm định')
              refresh()
            }}
          />
        </>
      )}

      {handover.status === 'Pending_Legal' && (
        <section className="av-panel d-flex flex-column gap-2" aria-label="Chờ thẩm định">
          <h2 className="mb-0 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
            <ShieldCheck size={16} aria-hidden="true" />
            Đang chờ thẩm định
          </h2>
          <p className="mb-0 fs-13 text-slate-600">Đang chờ người xác minh pháp lý xem xét hồ sơ. Bạn chưa thể sửa hồ sơ lúc này.</p>
          {mockMode === 'full' && (
            <div>
              <button
                type="button"
                className="av-ghost-btn"
                disabled={actionBusy}
                onClick={() => runAction('approve', () => simulateLegalApproval(handover.requestId), 'Đã mô phỏng duyệt pháp lý')}
              >
                Mô phỏng người xác minh duyệt hồ sơ
              </button>
            </div>
          )}
        </section>
      )}

      {handover.status === 'Approved' && (
        <section className="av-panel d-flex flex-column gap-2" aria-label="Sẵn sàng bàn giao">
          <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
            Sẵn sàng bàn giao
          </h2>
          <p className="mb-0 fs-13 text-slate-600">Hồ sơ đã được duyệt pháp lý. Bắt đầu bàn giao để chuyển các tài sản cho người thụ hưởng.</p>
          <div>
            <Button
              type="button"
              variant="primary"
              className="av-btn av-btn-md"
              disabled={actionBusy}
              onClick={() => runAction('start', () => startHandover(handover.requestId), 'Đã bắt đầu bàn giao')}
            >
              Bắt đầu bàn giao
            </Button>
          </div>
        </section>
      )}

      {handover.status === 'In_Progress' && (
        <DocumentUploadForm
          idPrefix="completion"
          title="Hoàn tất bàn giao"
          description="Nộp biên bản bàn giao kèm chữ ký số rời để đóng hồ sơ."
          fileLabel="Biên bản bàn giao"
          signatureRequired
          submitLabel="Hoàn tất bàn giao"
          onSubmit={async (input) => {
            await completeHandover(handover.requestId, input).catch(toActionError('complete'))
            notify('Đã hoàn tất bàn giao')
            refresh()
          }}
        />
      )}

      {handover.status === 'Completed' && (
        <p className="av-notice mb-0">
          <strong>Hồ sơ đã hoàn tất</strong> — không thể chỉnh sửa thêm.
        </p>
      )}
      {handover.status === 'Cancelled' && (
        <p className="av-notice mb-0">
          <strong>Hồ sơ đã bị hủy</strong> — không thể chỉnh sửa thêm.
        </p>
      )}

      {canShowChat(handover.status) && <HandoverChatPanel requestId={handover.requestId} counterpart="người thẩm định" />}

      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}
