import { ArrowRight, FileCheck2, FileText, Hourglass } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { downloadBeneficiaryHandoverDocument } from '../../callapi/beneficiaryApi'
import { emitNotificationsChanged } from '../../callapi/notificationApi'
import AppToast from '../../components/common/AppToast'
import { BackLink, ErrorState, LoadingState } from '../../components/beneficiary/BeneficiaryUi'
import CaseStatusBadge from '../../components/beneficiary/CaseStatusBadge'
import DocumentList from '../../components/beneficiary/DocumentList'
import HandoverStepper from '../../components/beneficiary/HandoverStepper'
import ReceiptCard from '../../components/beneficiary/ReceiptCard'
import ReceiptConfirmForm from '../../components/beneficiary/ReceiptConfirmForm'
import AssetTypeIcon from '../../components/owner/AssetTypeIcon'
import { useBeneficiaryHandoverDetail } from '../../hooks/useBeneficiary'
import { beneficiaryLoadErrorMessage, canConfirmReceipt } from '../../utils/beneficiary'
import { assetTypeLabel, formatAllocation } from '../../utils/catalog'

const BACK = { to: '/beneficiary/status', label: 'Quay lại tiến trình bàn giao' }

// Khối biên nhận: đã có thì hiện biên nhận, đủ điều kiện thì hiện form xác nhận, còn lại báo chờ
function ReceiptSection({ handover, receipt, assetName, onConfirmed }) {
  if (receipt) return <ReceiptCard receipt={receipt} assetName={assetName} />
  if (canConfirmReceipt(handover.status, receipt)) {
    return (
      <>
        <p className="mb-0 fs-13 text-slate-600">
          Người thi hành đã hoàn tất bàn giao và nộp biên bản có chữ ký số. Hãy kiểm tra giấy tờ, sau đó đính kèm biên bản xác nhận cùng chữ ký số của bạn để nhận biên nhận số.
        </p>
        <ReceiptConfirmForm handoverId={handover.handoverId} onConfirmed={onConfirmed} />
      </>
    )
  }
  return (
    <div className="av-empty d-flex flex-column align-items-center">
      <Hourglass size={28} className="text-slate-400 mb-2" aria-hidden="true" />
      <p className="mb-1 fw-semibold text-ink">Chưa đến bước xác nhận</p>
      <p className="mb-0">Bạn có thể xác nhận và nhận biên nhận số khi người thi hành hoàn tất bàn giao.</p>
    </div>
  )
}

// Trang chi tiết một hồ sơ bàn giao của người thụ hưởng: tiến trình, tài sản, giấy tờ và biên nhận
export default function BeneficiaryHandoverDetailPage() {
  const { handoverId } = useParams()
  const { status, error, data, reload, update } = useBeneficiaryHandoverDetail(handoverId)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (status === 'loading' && !data) return <LoadingState message="Đang tải hồ sơ bàn giao..." />
  if (status === 'error' || !data?.handover) {
    return (
      <div className="d-flex flex-column gap-3">
        <BackLink {...BACK} />
        <ErrorState message={beneficiaryLoadErrorMessage(error, 'Không tìm thấy hồ sơ bàn giao.')} onRetry={error?.status === 404 ? undefined : reload} />
      </div>
    )
  }

  const { handover, documents, receipt, inheritance } = data
  const asset = inheritance?.asset
  const assetName = asset?.name ?? `Tài sản #${handover.assetId}`

  const handleConfirmed = (created) => {
    update((current) => ({
      ...current,
      receipt: created ?? current.receipt,
      handover: { ...current.handover, status: 'Received' },
    }))
    setToast({ title: 'Đã xác nhận nhận tài sản', detail: created?.receiptId ? `Biên nhận số #${created.receiptId} đã được cấp.` : undefined })
    emitNotificationsChanged()
    // Tải lại để lấy trạng thái chính xác từ máy chủ
    reload()
  }

  return (
    <div className="d-flex flex-column gap-4">
      <BackLink {...BACK} />

      <section className="av-panel d-flex flex-column gap-4">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div>
            <p className="mb-1 av-mono-tag fs-10">HANDOVER CASE</p>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
                {`Hồ sơ bàn giao #${handover.handoverId}`}
              </h1>
              <CaseStatusBadge status={handover.status} />
            </div>
            <p className="mt-2 mb-0 fs-12 text-slate-500">{assetName}</p>
          </div>
          {status === 'loading' && <span className="spinner-border spinner-border-sm text-brand" role="status" aria-label="Đang cập nhật" />}
        </div>
        <HandoverStepper status={handover.status} />
      </section>

      <div className="row g-4">
        <section className="col-12 col-xl-5 d-flex flex-column gap-4">
          <div className="av-panel d-flex flex-column gap-3">
            <h2 className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
              Tài sản được bàn giao
            </h2>
            <div className="d-flex align-items-start gap-3">
              <span className="av-asset-icon">
                <AssetTypeIcon type={asset?.type} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="mb-1 fs-14 fw-bold text-ink">{assetName}</p>
                <p className="mb-0 fs-12 text-slate-500">
                  {[asset?.type && assetTypeLabel(asset.type), inheritance && `Phân bổ ${formatAllocation(inheritance.allocation)}`].filter(Boolean).join(' · ') ||
                    `Mã tài sản #${handover.assetId}`}
                </p>
              </div>
            </div>
            {asset?.description && <p className="mb-0 fs-12 text-slate-600 av-clamp-3">{asset.description}</p>}
            <Link to={`/beneficiary/assets/${handover.assetId}`} className="av-ghost-btn align-self-start" id="handover-view-asset">
              Xem chi tiết tài sản
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className="av-panel d-flex flex-column gap-3">
            <h2 className="mb-0 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
              <FileCheck2 size={16} aria-hidden="true" />
              Xác nhận &amp; Biên nhận số
            </h2>
            <ReceiptSection handover={handover} receipt={receipt} assetName={assetName} onConfirmed={handleConfirmed} />
          </div>
        </section>

        <section className="col-12 col-xl-7">
          <div className="av-panel d-flex flex-column gap-3 h-100">
            <h2 className="mb-0 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
              <FileText size={16} aria-hidden="true" />
              Giấy tờ bàn giao
            </h2>
            <p className="mb-0 fs-12 text-slate-500">Biên bản, giấy chứng tử và các tài liệu người thi hành đã nộp cho hồ sơ này.</p>
            <DocumentList
              documents={documents ?? []}
              label="Giấy tờ bàn giao"
              emptyMessage="Người thi hành chưa nộp giấy tờ nào cho hồ sơ này."
              download={(document) => downloadBeneficiaryHandoverDocument(handover.handoverId, document.documentId)}
              onDownloaded={(document, signatureValid) =>
                setToast({ title: `Đã tải xuống ${document.fileName}`, detail: signatureValid ? 'Chữ ký số của tệp hợp lệ.' : 'Tệp chưa có chữ ký hợp lệ để đối chiếu.' })
              }
            />
          </div>
        </section>
      </div>

      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}
