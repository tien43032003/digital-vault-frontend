import { CreditCard, X } from 'lucide-react'
import { Button, Modal } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { getPlans } from '../../callapi/paymentApi'
import { useAdminResource } from '../../hooks/useAdminResource'
import AdminResourceState from '../admin/AdminResourceState'
import PlanCard from './PlanCard'

// Hộp thoại chọn gói khi người dùng mới (chưa có gói) bấm tạo kho đầu tiên:
// gói có phí chuyển sang màn hình Thanh toán (xem báo giá, đồng ý điều khoản rồi mới sang VNPay), gói miễn phí (giá 0) tiếp tục sang bước tạo kho (onContinueFree)
export default function ChoosePlanModal({ onClose, onContinueFree }) {
  const navigate = useNavigate()
  const { data: plans, error, loading, reload } = useAdminResource(getPlans)

  const handleChoose = (plan) => {
    if (Number(plan.price) === 0) {
      onContinueFree(plan)
      return
    }
    navigate(`/owner/plans/${plan.planId}/checkout`)
  }

  return (
    <Modal show onHide={onClose} centered animation={false} size="xl" dialogClassName="av-modal" aria-labelledby="choose-plan-title">
      <div className="av-modal-head">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <CreditCard size={20} aria-hidden="true" />
          </span>
          <div>
            <span className="av-modal-tag av-mono-tag">SUBSCRIPTION PLAN</span>
            <h2 id="choose-plan-title" className="mt-1 mb-0 fw-bold text-ink" style={{ fontSize: 19, letterSpacing: '-0.025em' }}>
              Chọn gói trước khi tạo kho đầu tiên
            </h2>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="av-close-btn">
          <X size={16} />
        </button>
      </div>

      <div className="av-modal-body d-flex flex-column gap-3">
        <p className="mb-0 fs-13 text-slate-600">
          Bạn chưa có gói dịch vụ nào. Chọn một gói phù hợp để bắt đầu tạo kho; gói có phí được thanh toán an toàn qua cổng VNPay.
        </p>

        <AdminResourceState error={error} loading={loading} hasData={Boolean(plans)} loadingText="Đang tải các gói dịch vụ..." onRetry={reload} />

        {plans && plans.length === 0 && <p className="av-empty mb-0">Hiện chưa có gói dịch vụ nào đang bán.</p>}

        {plans && plans.length > 0 && (
          <div className="row g-3">
            {plans.map((plan) => (
              <div key={plan.planId} className="col-12 col-md-6 col-lg-4">
                <PlanCard plan={plan} actionLabel={Number(plan.price) === 0 ? 'Dùng gói miễn phí' : 'Chọn gói và thanh toán'} onChoose={handleChoose} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="av-modal-foot justify-content-end">
        <Button type="button" variant="light" onClick={onClose} className="av-btn av-btn-md border">
          Để sau
        </Button>
      </div>
    </Modal>
  )
}
