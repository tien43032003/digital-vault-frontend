import { Scale, X } from 'lucide-react'
import { Button, Modal } from 'react-bootstrap'
import { formatDate } from '../../utils/proofOfLife'

function Row({ label, children }) {
  return (
    <div className="d-flex flex-wrap justify-content-between gap-2 fs-13">
      <span className="text-slate-500">{label}</span>
      <span className="fw-semibold text-ink text-end">{children}</span>
    </div>
  )
}

// Hồ sơ pháp lý của Executor: thông tin hợp đồng, phạm vi ủy quyền và điều kiện mở khóa tài sản
export default function ExecutorLegalModal({ executor, assetCount, onClose }) {
  return (
    <Modal show onHide={onClose} centered animation={false} dialogClassName="av-modal" aria-labelledby="executor-legal-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <Scale size={20} aria-hidden="true" />
          </span>
          <h2 id="executor-legal-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
            Hồ Sơ Pháp Lý Của Executor
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <div className="av-modal-body d-flex flex-column gap-3">
        <div className="d-flex flex-column gap-2">
          <Row label="Họ và tên">{executor.fullName}</Row>
          <Row label="Tổ chức">{executor.organization}</Row>
          <Row label="Số thẻ hành nghề">{`Thẻ LS: ${executor.licenseNumber}`}</Row>
          <Row label="Email">{executor.email}</Row>
          <Row label="Hotline">{executor.hotline}</Row>
          <Row label="Địa chỉ">{executor.address}</Row>
          <Row label="Số hợp đồng ủy quyền">{executor.contractNumber}</Row>
          <Row label="Ngày ủy quyền">{formatDate(executor.assignedAt)}</Row>
          {assetCount !== null && <Row label="Phạm vi ủy quyền">{`${assetCount} tài sản`}</Row>}
        </div>

        <div className="av-info-box">
          <h3 className="mb-2 fw-bold text-ink" style={{ fontSize: 14 }}>
            Điều kiện mở khóa tài sản
          </h3>
          <ul className="mb-0 fs-13 text-slate-600" style={{ lineHeight: 1.7 }}>
            <li>Executor gửi hồ sơ kèm bằng chứng (giấy chứng tử nếu có) và được người xác minh pháp lý thông qua.</li>
            <li>Bạn luôn có toàn quyền thu hồi hoặc thay thế Executor trước khi bàn giao được kích hoạt.</li>
          </ul>
        </div>
      </div>

      <div className="av-modal-foot justify-content-end gap-2">
        <Button type="button" variant="primary" onClick={onClose} className="av-btn av-btn-md">
          Đã hiểu
        </Button>
      </div>
    </Modal>
  )
}
