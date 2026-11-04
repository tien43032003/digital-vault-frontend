import { CreditCard, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { createVnpayCheckout, getPlans } from '../../callapi/paymentApi'
import AdminResourceState from '../../components/admin/AdminResourceState'
import MockNotice from '../../components/common/MockNotice'
import PlanCard from '../../components/owner/PlanCard'
import { useAdminResource } from '../../hooks/useAdminResource'
import { MOCK_MODE } from '../../mocks/mode'
import { redirectTo } from '../../utils/navigation'
import { checkoutErrorMessage } from '../../utils/payment'

// Trang "Gói dịch vụ" của Owner: chọn gói và chuyển sang cổng VNPay để thanh toán
export default function OwnerPlansPage({ mockMode = MOCK_MODE }) {
  const { data: plans, error, loading, reload } = useAdminResource(getPlans)
  const [payingId, setPayingId] = useState(null)
  const [payError, setPayError] = useState('')

  const handlePay = async (plan) => {
    setPayingId(plan.planId)
    setPayError('')
    try {
      const checkout = await createVnpayCheckout(plan.planId)
      // Giữ nút khóa cho tới khi trình duyệt rời trang để không bấm thanh toán hai lần
      redirectTo(checkout.paymentUrl)
    } catch (caught) {
      setPayingId(null)
      setPayError(checkoutErrorMessage(caught))
    }
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <CreditCard size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Gói dịch vụ
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Chọn gói phù hợp và thanh toán an toàn qua cổng VNPay. Sau khi thanh toán thành công, gói mới có hiệu lực và gói đang dùng sẽ hết hạn.</p>
          </div>
        </div>
        <Button type="button" variant="light" className="av-btn av-btn-sm border" disabled={loading || payingId !== null} onClick={reload}>
          <RefreshCw size={16} aria-hidden="true" />
          Làm mới
        </Button>
      </section>

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      {payError && <Alert variant="danger" className="av-alert mb-0">{payError}</Alert>}

      <AdminResourceState error={error} loading={loading} hasData={Boolean(plans)} loadingText="Đang tải các gói dịch vụ..." onRetry={reload} />

      {plans && plans.length === 0 && <p className="av-empty mb-0">Hiện chưa có gói dịch vụ nào đang bán.</p>}

      {plans && plans.length > 0 && (
        <div className="row g-3">
          {plans.map((plan) => (
            <div key={plan.planId} className="col-12 col-lg-4">
              <PlanCard
                plan={plan}
                busy={payingId === plan.planId}
                disabled={payingId !== null}
                actionLabel="Thanh toán qua VNPay"
                busyLabel="Đang chuyển tới VNPay..."
                onChoose={handlePay}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
