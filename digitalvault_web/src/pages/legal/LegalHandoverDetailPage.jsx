import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Badge, Button, Col, Modal, Row, Table } from 'react-bootstrap'
import { Link, useParams } from 'react-router-dom'
import { downloadLegalHandoverDocument } from '../../callapi/legalApi'
import AppToast from '../../components/common/AppToast'
import HandoverStatusBadge from '../../components/executor/HandoverStatusBadge'
import ReviewActionModal from '../../components/legal/ReviewActionModal'
import OwnerStatusCard from '../../components/legal/OwnerStatusCard'
import ReviewHistory from '../../components/legal/ReviewHistory'
import { useLegalHandoverDetail } from '../../hooks/useLegalHandoverDetail'
import { downloadBlob } from '../../utils/download'
import { assetTypeLabel, formatAllocation } from '../../utils/catalog'
import { vaultLabel } from '../../utils/executor'
import { documentSubmittedLabel, handoverCode, handoverStatusInfo } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'

const CASE_STATUS_LABELS = {
  Pending: 'Chờ bàn giao',
  In_Progress: 'Đang chuyển giao',
  Completed: 'Đã hoàn tất',
  Received: 'Đã nhận tài sản',
  Cancelled: 'Đã hủy',
}

// Nội dung thông báo theo kết quả thẩm định (trạng thái mới của hồ sơ sau khi duyệt / từ chối / yêu cầu bổ sung)
const REVIEW_OUTCOMES = {
  Approved: {
    title: 'Đã duyệt hồ sơ',
    description: 'Hồ sơ đã được phê duyệt pháp lý. Người thi hành có thể bắt đầu bàn giao tài sản cho người thụ hưởng.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  In_Progress: {
    title: 'Đã duyệt hồ sơ',
    description: 'Hồ sơ đã được phê duyệt pháp lý và Người thi hành đang bàn giao tài sản cho người thụ hưởng.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  Completed: {
    title: 'Đã duyệt hồ sơ',
    description: 'Hồ sơ đã được phê duyệt pháp lý và đã hoàn tất bàn giao tài sản.',
    icon: CheckCircle2,
    tone: 'ok',
  },
  Rejected: {
    title: 'Đã từ chối hồ sơ',
    description: 'Hồ sơ đã bị từ chối. Người thi hành sẽ nhận được lý do từ chối.',
    icon: XCircle,
    tone: 'danger',
  },
  Additional_Info: {
    title: 'Đã yêu cầu bổ sung thông tin',
    description: 'Người thi hành sẽ bổ sung giấy tờ rồi gửi lại hồ sơ để thẩm định.',
    icon: AlertCircle,
    tone: 'warn',
  },
}
const DEFAULT_OUTCOME = { title: 'Đã lưu kết quả thẩm định', description: 'Kết quả thẩm định đã được ghi nhận.', icon: CheckCircle2, tone: 'ok' }

export default function LegalHandoverDetailPage() {
  const { requestId } = useParams()
  const { status, error, handover, reload } = useLegalHandoverDetail(requestId)

  const [reviewModalType, setReviewModalType] = useState(null)
  const [reviewResult, setReviewResult] = useState(null)
  const [resultModalOpen, setResultModalOpen] = useState(false)
  const [downloadingDocId, setDownloadingDocId] = useState(null)
  const [downloadError, setDownloadError] = useState('')
  const [toast, setToast] = useState(null)

  const closeToast = useCallback(() => setToast(null), [])

  // Tải giấy tờ chứng tử / bằng chứng Executor đã nộp
  const handleDownloadHandoverDoc = async (doc) => {
    setDownloadingDocId(doc.documentId)
    setDownloadError('')
    try {
      const { blob, signatureValid } = await downloadLegalHandoverDocument(handover.requestId, doc.documentId)
      downloadBlob(doc.fileName || `document-${doc.documentId}.bin`, blob)
      setToast({
        title: `Đã tải xuống ${doc.fileName || 'giấy tờ hồ sơ'}`,
        detail: signatureValid ? 'Chữ ký số hợp lệ.' : undefined,
      })
    } catch (err) {
      setDownloadError(`Không thể tải ${doc.fileName || 'tài liệu'}: ${err?.message || 'Lỗi kết nối'}`)
    } finally {
      setDownloadingDocId(null)
    }
  }

  // Xử lý sau khi thẩm định thành công (Approve / Reject / Additional Info)
  const handleReviewSuccess = (reviewDto) => {
    setReviewModalType(null)
    setReviewResult(reviewDto)
    setResultModalOpen(true)
    // Tải lại trang chi tiết hồ sơ ngay sau khi thẩm định
    reload()
  }

  if (status === 'loading') {
    return (
      <div className="p-5 text-center">
        <p role="status" className="d-inline-flex align-items-center gap-3 fs-14 text-slate-500">
          <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
          Đang tải chi tiết hồ sơ thẩm định...
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="d-flex flex-column gap-3">
        <Link to="/verifier/pending" className="d-inline-flex align-items-center gap-2 fs-13 text-slate-600 text-decoration-none">
          <ArrowLeft size={16} aria-hidden="true" /> Quay lại danh sách chờ thẩm định
        </Link>
        <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between mb-0">
          <span>{error?.status === 404 ? 'Không tìm thấy hồ sơ bàn giao.' : error?.message || 'Lỗi khi tải hồ sơ.'}</span>
          <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      </div>
    )
  }

  if (!handover) return null

  // Trạng thái hiện tại: ưu tiên kết quả vừa thẩm định để giao diện đổi ngay, không phải chờ tải lại hồ sơ
  const currentStatus = reviewResult?.status ?? handover.status
  const isPendingLegal = currentStatus === 'Pending_Legal'
  const outcome = REVIEW_OUTCOMES[currentStatus]
  // Kết quả thẩm định đã có (vừa làm xong, hoặc lấy từ hồ sơ khi mở lại trang)
  const reviewInfo = reviewResult ?? (outcome ? handover.verification : null)
  const OutcomeIcon = (outcome ?? DEFAULT_OUTCOME).icon
  // Tên chủ kho: BE trả ownerName và owner.fullName (bản cũ chỉ có owner)
  const ownerName = handover.ownerName ?? handover.owner?.fullName ?? null
  const handoverDocs = handover.documents ?? []
  // Tài sản của chủ kho kèm tài liệu (BE: GET /legal/handovers/{id}/assets); dữ liệu phẳng cũ chỉ có assetDocuments thì gom vào một nhóm chung
  const assetGroups = (handover.assets ?? (handover.assetDocuments?.length ? [{ assetId: null, name: 'Tài liệu tài sản', documents: handover.assetDocuments }] : [])).map((asset) => ({ ...asset, documents: asset.documents ?? [] }))
  const assetDocCount = assetGroups.reduce((sum, asset) => sum + asset.documents.length, 0)
  const assetNames = new Map(assetGroups.map((asset) => [asset.assetId, asset.name]))
  const cases = handover.cases ?? []

  return (
    <div className="d-flex flex-column gap-4">
      {/* Liên kết quay lại */}
      <div>
        <Link
          to="/verifier/pending"
          className="d-inline-flex align-items-center gap-2 fs-13 fw-medium text-slate-600 text-decoration-none hover-primary"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Quay lại danh sách chờ thẩm định
        </Link>
      </div>

      {/* Banner thông tin hồ sơ */}
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <FileCheck size={22} className="text-brand" aria-hidden="true" />
          </span>
          <div>
            <div className="d-flex align-items-center gap-2 mb-1">
              <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
                {[handoverCode(handover), ownerName, vaultLabel(handover.vaultId, handover.vaultName)].filter(Boolean).join(' · ')}
              </h1>
              <HandoverStatusBadge status={currentStatus} />
            </div>
            <p className="mb-0 fs-12 text-slate-500 d-flex flex-wrap align-items-center gap-2">
              <span>Hồ sơ thẩm định pháp lý</span>
              <span aria-hidden="true">·</span>
              <span>{`Khởi tạo lúc ${formatDateTime(handover.initiatedAt)}`}</span>
              {handover.requestType && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{`Loại yêu cầu: ${handover.requestType}`}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="light"
          className="av-btn av-btn-sm border d-flex align-items-center gap-2"
          onClick={reload}
          title="Tải lại chi tiết hồ sơ"
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Làm mới</span>
        </Button>
      </section>

      {/* KHU VỰC HÀNH ĐỘNG THẨM ĐỊNH (3 NÚT: DUYỆT - TỪ CHỐI - YÊU CẦU BỔ SUNG) */}
      <section className="av-panel" aria-label="Hành động thẩm định pháp lý">
        <div className="d-flex flex-column gap-3">
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <h2 className="mb-1 fw-bold text-ink fs-16">
                Hành động thẩm định pháp lý
              </h2>
              <p className="mb-0 fs-12 text-slate-500">
                Thẩm định tính xác thực của giấy chứng tử, bằng chứng pháp lý và các tài sản thừa kế.
              </p>
            </div>

            {/* Đã thẩm định: kết quả thay cho 3 nút; chưa thẩm định: 3 nút hành động */}
            {outcome ? (
              <div className={`av-result-box is-${outcome.tone} align-self-stretch`} role="status" style={{ minWidth: 280, maxWidth: 460 }}>
                <OutcomeIcon size={20} className="flex-shrink-0 mt-1" aria-hidden="true" />
                <div className="fs-13 d-flex flex-column gap-1" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <strong>Kết quả thẩm định:</strong>
                    <HandoverStatusBadge status={currentStatus} />
                  </div>
                  {reviewInfo?.comment && <div><strong>Ý kiến thẩm định:</strong> {reviewInfo.comment}</div>}
                  {reviewInfo?.reviewedAt && <div><strong>Thời gian:</strong> {formatDateTime(reviewInfo.reviewedAt)}</div>}
                </div>
              </div>
            ) : (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="success"
                className="d-flex align-items-center gap-2 fs-13 fw-semibold px-3 py-2"
                disabled={!isPendingLegal}
                onClick={() => setReviewModalType('approve')}
                title={isPendingLegal ? 'Phê duyệt hồ sơ bàn giao' : 'Chỉ được thẩm định khi hồ sơ ở trạng thái Pending_Legal'}
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                Duyệt hồ sơ
              </Button>

              <Button
                type="button"
                variant="danger"
                className="d-flex align-items-center gap-2 fs-13 fw-semibold px-3 py-2"
                disabled={!isPendingLegal}
                onClick={() => setReviewModalType('reject')}
                title={isPendingLegal ? 'Từ chối hồ sơ hoặc yêu cầu Người thi hành bổ sung' : 'Chỉ được thẩm định khi hồ sơ ở trạng thái Pending_Legal'}
              >
                <XCircle size={16} aria-hidden="true" />
                Từ chối / Yêu cầu bổ sung
              </Button>

            </div>
            )}
          </div>

          {/* Cảnh báo nếu hồ sơ không ở trạng thái Pending_Legal và chưa có kết quả thẩm định */}
          {!isPendingLegal && !outcome && (
            <div className="p-3 rounded bg-light border border-warning-subtle d-flex align-items-center gap-2 fs-12 text-slate-600">
              <Clock size={16} className="text-warning flex-shrink-0" />
              <span>
                <strong>Lưu ý:</strong> Hồ sơ hiện ở trạng thái <em>{handoverStatusInfo(currentStatus).text}</em>. Chỉ những hồ sơ ở trạng thái <strong>Chờ thẩm định pháp lý (Pending_Legal)</strong> mới được thực hiện hành động thẩm định.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Tình trạng chủ kho (owner-status): trạng thái sống, giấy chứng tử, thời điểm xác minh */}
      <OwnerStatusCard
        status={handover.ownerStatus}
        certificateName={handoverDocs.find((doc) => doc.documentId === handover.ownerStatus?.deathCertificateDocumentId)?.fileName ?? null}
        downloading={downloadingDocId === handover.ownerStatus?.deathCertificateDocumentId}
        onDownloadDeathCertificate={(documentId) =>
          handleDownloadHandoverDoc(handoverDocs.find((doc) => doc.documentId === documentId) ?? { documentId, fileName: `giay-chung-tu-${documentId}.pdf` })
        }
      />

      {/* Lỗi download nếu có */}
      {downloadError && (
        <Alert variant="danger" className="av-alert mb-0" dismissible onClose={() => setDownloadError('')}>
          {downloadError}
        </Alert>
      )}

      {/* Grid: Giấy tờ chứng tử & Bằng chứng vs Tài liệu tài sản */}
      <Row className="g-4">
        {/* CỘT 1: Giấy tờ chứng tử và bằng chứng Executor nộp */}
        <Col xs={12} lg={6}>
          <section className="av-panel h-100 d-flex flex-column gap-3">
            <div className="d-flex align-items-center justify-content-between">
              <h2 className="mb-0 fw-bold text-ink fs-15 d-flex align-items-center gap-2">
                <FileText size={18} className="text-brand" />
                Giấy chứng tử &amp; Bằng chứng Executor nộp
              </h2>
              <Badge bg="secondary" className="fs-11 fw-normal">
                {handoverDocs.length} tệp
              </Badge>
            </div>

            {handoverDocs.length === 0 ? (
              <p className="av-empty mb-0 fs-13 text-slate-500 py-4 text-center">
                Người thi hành chưa nộp giấy tờ nào trong hồ sơ này.
              </p>
            ) : (
              <div className="d-flex flex-column gap-2">
                {handoverDocs.map((doc) => (
                  <div key={doc.documentId} className="p-3 border rounded-3 bg-white d-flex align-items-center justify-content-between gap-3">
                    <div className="d-flex align-items-center gap-3 overflow-hidden">
                      <span className="av-icon-tile" style={{ width: 36, height: 36, minWidth: 36 }}>
                        <FileText size={16} />
                      </span>
                      <div className="overflow-hidden">
                        <p className="mb-0 fs-13 fw-semibold text-ink text-truncate" title={doc.fileName}>
                          {doc.fileName || `Tài liệu #${doc.documentId}`}
                        </p>
                        <div className="d-flex align-items-center gap-2 fs-11 text-slate-500 mt-1">
                          {doc.fileType && <span>{doc.fileType}</span>}
                          {documentSubmittedLabel(doc) && <span>{documentSubmittedLabel(doc)}</span>}
                          {doc.isEncrypted && (
                            <span className="badge bg-light text-secondary border d-inline-flex align-items-center gap-1">
                              <Lock size={10} /> Đã mã hóa
                            </span>
                          )}
                          {/* Giấy tờ Executor nộp phải có file chữ ký .sig đi kèm và khớp thì mới hợp lệ; thiếu chữ ký hoặc chưa xác thực được đều là không hợp lệ */}
                          <span
                            className={`badge ${doc.signatureValid === true ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}
                            title={doc.signatureValid === true ? 'Có file chữ ký .sig đi kèm và chữ ký khớp với tài liệu' : 'Không có file chữ ký .sig đi kèm hoặc chữ ký không khớp với tài liệu'}
                          >
                            {doc.signatureValid === true ? 'Chữ ký hợp lệ' : 'Chữ ký không hợp lệ'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline-primary"
                      size="sm"
                      className="d-inline-flex align-items-center gap-1 flex-shrink-0 fs-12 px-3"
                      disabled={downloadingDocId === doc.documentId}
                      onClick={() => handleDownloadHandoverDoc(doc)}
                    >
                      <Download size={13} />
                      {downloadingDocId === doc.documentId ? 'Đang tải...' : 'Tải về'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Col>

        {/* CỘT 2: Tài liệu của tài sản (Asset Documents) */}
        <Col xs={12} lg={6}>
          <section className="av-panel h-100 d-flex flex-column gap-3">
            <div className="d-flex align-items-center justify-content-between">
              <h2 className="mb-0 fw-bold text-ink fs-15 d-flex align-items-center gap-2">
                <ShieldCheck size={18} className="text-brand" />
                Tài liệu của tài sản trong kho
              </h2>
              <Badge bg="secondary" className="fs-11 fw-normal">
                {`${assetGroups.length} tài sản · ${assetDocCount} tệp`}
              </Badge>
            </div>

            {assetGroups.length === 0 ? (
              <p className="av-empty mb-0 fs-13 text-slate-500 py-4 text-center">Hồ sơ này chưa có tài sản nào của chủ kho.</p>
            ) : (
              <div className="d-flex flex-column gap-3">
                {assetGroups.map((asset) => (
                  <div key={asset.assetId ?? 'other'} className="border rounded-3 bg-white">
                    <div className="px-3 py-2 d-flex align-items-center justify-content-between gap-2 border-bottom bg-light rounded-top-3">
                      <div className="overflow-hidden">
                        <p className="mb-0 fs-13 fw-bold text-ink text-truncate" title={asset.name}>
                          {asset.name || `Tài sản #${asset.assetId}`}
                        </p>
                        {(asset.type || asset.description) && (
                          <p className="mb-0 fs-11 text-slate-500 text-truncate">
                            {[asset.type && assetTypeLabel(asset.type), asset.description].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <span className="badge bg-white text-secondary border flex-shrink-0">{`${asset.documents.length} tệp`}</span>
                    </div>

                    {asset.documents.length === 0 ? (
                      <p className="mb-0 px-3 py-3 fs-12 text-slate-500">Tài sản này chưa có giấy tờ nào.</p>
                    ) : (
                      <div className="d-flex flex-column gap-2 p-2">
                        {asset.documents.map((doc) => (
                          <div key={doc.documentId} className="p-2 border rounded-3 d-flex align-items-center justify-content-between gap-3">
                            <div className="d-flex align-items-center gap-3 overflow-hidden">
                              <span className="av-icon-tile" style={{ width: 36, height: 36, minWidth: 36 }}>
                                <FileCheck size={16} />
                              </span>
                              <div className="overflow-hidden">
                                <p className="mb-0 fs-13 fw-semibold text-ink text-truncate" title={doc.fileName}>
                                  {doc.fileName || `Tài liệu tài sản #${doc.documentId}`}
                                </p>
                                <div className="d-flex align-items-center flex-wrap gap-2 fs-11 text-slate-500 mt-1">
                                  {doc.fileType && <span>{doc.fileType}</span>}
                                  {doc.isEncrypted && (
                                    <span className="badge bg-light text-secondary border d-inline-flex align-items-center gap-1">
                                      <Lock size={10} /> Đã mã hóa
                                    </span>
                                  )}
                                  {doc.signatureValid !== undefined && doc.signatureValid !== null && (
                                    <span className={`badge ${doc.signatureValid ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'}`}>
                                      {doc.signatureValid ? 'Chữ ký Owner hợp lệ' : 'Chữ ký không hợp lệ'}
                                    </span>
                                  )}
                                  {doc.status && doc.status !== 'Active' && <span className="badge bg-light text-secondary border">{doc.status}</span>}
                                </div>
                              </div>
                            </div>

                            {/* BE khóa tải nội dung tài sản với người thẩm định (có thể chứa seed phrase, khóa bí mật): chỉ xem trạng thái chữ ký */}
                            <span
                              className="badge bg-light text-secondary border d-inline-flex align-items-center gap-1 flex-shrink-0 px-2 py-2"
                              title="Nội dung tài sản được niêm phong bảo mật, chỉ giải mã cho Người thụ hưởng hợp pháp sau khi hoàn tất bàn giao"
                            >
                              <Lock size={12} />
                              Niêm phong bảo mật
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </Col>
      </Row>

      {/* Danh sách các tài sản và phân bổ thừa kế trong hồ sơ */}
      <section className="av-panel d-flex flex-column gap-3">
        <h2 className="mb-0 fw-bold text-ink fs-15">
          Danh mục tài sản &amp; Người nhận phân bổ ({cases.length})
        </h2>

        {cases.length === 0 ? (
          <p className="av-empty mb-0 fs-13 text-slate-500 py-3">Hồ sơ chưa có phân công tài sản nào.</p>
        ) : (
          <div className="table-responsive">
            <Table hover className="align-middle mb-0 fs-13">
              <thead className="bg-light">
                <tr className="fs-11 text-slate-500 text-uppercase border-bottom">
                  <th scope="col" className="py-2">Mã bàn giao</th>
                  <th scope="col" className="py-2">Tài sản</th>
                  <th scope="col" className="py-2">Người thụ hưởng</th>
                  <th scope="col" className="py-2 text-end">Tỉ lệ phân bổ</th>
                  <th scope="col" className="py-2">Trạng thái bàn giao</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.handoverId}>
                    <td className="fw-semibold text-ink">#{c.handoverId}</td>
                    <td>{c.assetName ?? assetNames.get(c.assetId) ?? `Tài sản #${c.assetId}`}</td>
                    <td>{c.beneficiaryName ?? `Người nhận #${c.beneficiaryId}`}</td>
                    <td className="text-end fw-semibold text-ink">{c.allocationPercentage == null ? "—" : formatAllocation(c.allocationPercentage)}</td>
                    <td>
                      <span className="badge bg-light text-dark border">
                        {CASE_STATUS_LABELS[c.status] || c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      {/* Lịch sử các lần thẩm định của hồ sơ */}
      <ReviewHistory entries={handover.history ?? []} />

      {/* Modal xác nhận thẩm định kèm ô nhập nhận xét validation 1-2000 ký tự */}
      {reviewModalType && (
        <ReviewActionModal
          show={Boolean(reviewModalType)}
          type={reviewModalType}
          requestId={handover.requestId}
          onClose={() => setReviewModalType(null)}
          onSuccess={handleReviewSuccess}
        />
      )}

      {/* Modal thông báo kết quả thẩm định vừa thực hiện */}
      <Modal
        show={resultModalOpen && Boolean(reviewResult)}
        onHide={() => setResultModalOpen(false)}
        centered
        animation={false}
        dialogClassName="av-modal av-modal-sm"
        aria-labelledby="review-result-title"
      >
        <div className="av-modal-body d-flex flex-column align-items-center text-center gap-3 pt-4">
          <span className={`av-result-icon is-${(outcome ?? DEFAULT_OUTCOME).tone}`}>
            <OutcomeIcon size={28} aria-hidden="true" />
          </span>
          <div>
            <h2 id="review-result-title" className="mb-1 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
              {(outcome ?? DEFAULT_OUTCOME).title}
            </h2>
            <p className="mb-0 fs-13 text-slate-600">{(outcome ?? DEFAULT_OUTCOME).description}</p>
          </div>
          <dl className="av-info-box w-100 mb-0 text-start fs-13 d-flex flex-column gap-1">
            {reviewResult?.verificationId != null && (
              <div><dt className="d-inline fw-semibold">Mã thẩm định: </dt><dd className="d-inline mb-0">{`#${reviewResult.verificationId}`}</dd></div>
            )}
            <div><dt className="d-inline fw-semibold">Trạng thái mới: </dt><dd className="d-inline mb-0">{handoverStatusInfo(currentStatus).text}</dd></div>
            {reviewResult?.comment && (
              <div><dt className="d-inline fw-semibold">Ý kiến thẩm định: </dt><dd className="d-inline mb-0">{reviewResult.comment}</dd></div>
            )}
            {reviewResult?.reviewedAt && (
              <div><dt className="d-inline fw-semibold">Thời gian: </dt><dd className="d-inline mb-0">{formatDateTime(reviewResult.reviewedAt)}</dd></div>
            )}
          </dl>
        </div>
        <div className="av-modal-foot justify-content-center">
          <Button type="button" variant="primary" className="av-btn av-btn-md" onClick={() => setResultModalOpen(false)}>
            Đã hiểu
          </Button>
        </div>
      </Modal>

      {/* Toast thông báo */}
      <AppToast
        show={Boolean(toast)}
        onClose={closeToast}
        title={toast?.title}
        detail={toast?.detail}
      />
    </div>
  )
}
