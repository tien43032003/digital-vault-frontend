import { HardDrive, Vault } from 'lucide-react'
import { Button } from 'react-bootstrap'
import { formatDuration, formatStorage, formatVnd } from '../../utils/payment'

// Thẻ một gói dịch vụ (tên, giá, hạn mức) kèm nút chọn; dùng ở trang Gói dịch vụ và hộp thoại chọn gói khi tạo kho đầu tiên
export default function PlanCard({ plan, busy = false, disabled = false, actionLabel, busyLabel, onChoose }) {
  const free = Number(plan.price) === 0
  return (
    <article className="av-panel d-flex flex-column gap-3 h-100" aria-label={plan.planName}>
      <div>
        <h2 className="mb-1 fw-bold text-ink" style={{ fontSize: 18 }}>
          {plan.planName}
        </h2>
        <p className="mb-0">
          <span className="av-stat-value">{free ? 'Miễn phí' : formatVnd(plan.price)}</span>
          <span className="av-stat-unit">{`/ ${formatDuration(plan.durationDays)}`}</span>
        </p>
      </div>
      <ul className="list-unstyled mb-0 d-flex flex-column gap-2 fs-13 text-slate-600 flex-grow-1">
        <li className="d-flex align-items-center gap-2">
          <Vault size={14} aria-hidden="true" className="text-brand" />
          {`Tối đa ${plan.maxVaults} kho`}
        </li>
        <li className="d-flex align-items-center gap-2">
          <HardDrive size={14} aria-hidden="true" className="text-brand" />
          {`Dung lượng ${formatStorage(plan.maxStorageBytes)}`}
        </li>
      </ul>
      <Button type="button" variant="primary" className="av-btn av-btn-md" disabled={disabled || busy} onClick={() => onChoose(plan)}>
        {busy ? busyLabel : actionLabel}
      </Button>
    </article>
  )
}
