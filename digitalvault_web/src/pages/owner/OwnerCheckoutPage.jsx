import { AlertTriangle, Building2, CalendarClock, CreditCard, HardDrive, Landmark, Lock, QrCode, ShieldCheck, Vault, Wallet } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createVnpayCheckout, getMySubscription, getPlans, getQuote, selectFreePlan } from '../../callapi/paymentApi'
import AdminResourceState from '../../components/admin/AdminResourceState'
import { BackLink } from '../../components/beneficiary/BeneficiaryUi'
import MockNotice from '../../components/common/MockNotice'
import VnpayQrPanel, { QR_POLL_MS } from '../../components/payment/VnpayQrPanel'
import { useAdminResource } from '../../hooks/useAdminResource'
import { MOCK_MODE } from '../../mocks/mode'
import { redirectTo } from '../../utils/navigation'
import {
  checkoutErrorMessage,
  clearPendingCheckout,
  estimatedEndDate,
  formatDuration,
  formatPaymentDate,
  formatPlanPrice,
  formatStorage,
  formatVnd,
  getPendingCheckoutByPlan,
  isFreePlan,
  needsGatewayRedirect,
  PAYMENT_METHODS,
  savePendingCheckout,
} from '../../utils/payment'
import { getPlanChange } from '../../utils/planChange'

const METHOD_ICONS = { VNPay: Landmark, MoMo: Wallet, BankTransfer: Building2 }

// Tải danh mục gói, gói hiện tại và báo giá của BE cùng lúc; lỗi khi lấy gói hiện tại hoặc báo giá không chặn việc thanh toán
// (không có báo giá thì dùng quy tắc tại chỗ; BE vẫn kiểm tra lại khi tạo giao dịch)
async function loadCheckout(planId) {
  const [plans, subscription, quote] = await Promise.all([getPlans(), getMySubscription().catch(() => null), getQuote(planId).catch(() => null)])
  return { plans, subscription, quote }
}

function SummaryRow({ label, children, strong = false }) {
  return (
    <div className="d-flex justify-content-between align-items-baseline gap-3">
      <dt className={`fw-normal ${strong ? 'text-ink fw-semibold' : 'text-slate-500'}`}>{label}</dt>
      <dd className={`mb-0 text-end ${strong ? 'fw-bold text-ink' : 'text-ink'}`} style={strong ? { fontSize: 20 } : undefined}>
        {children}
      </dd>
    </div>
  )
}

function Unavailable({ title, message }) {
  return (
    <section className="av-panel d-flex flex-column gap-3">
      <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20 }}>
        {title}
      </h1>
      <p className="mb-0 fs-13 text-slate-500">{message}</p>
      <div>
        <Button as={Link} to="/owner/plans" variant="primary" className="av-btn av-btn-md">
          Xem các gói dịch vụ
        </Button>
      </div>
    </section>
  )
}

// Một lựa chọn phương thức thanh toán; phương thức BE chưa hỗ trợ hiển thị mờ kèm nhãn "Sắp ra mắt"
function MethodOption({ method, checked, onChange }) {
  const Icon = METHOD_ICONS[method.value] ?? CreditCard
  const id = `payment-method-${method.value}`
  return (
    <label
      htmlFor={id}
      className={`d-flex align-items-center gap-3 mb-0 rounded-3 border ${checked ? 'av-info-box' : ''}`}
      style={{ padding: 14, cursor: method.available ? 'pointer' : 'not-allowed', opacity: method.available ? 1 : 0.55 }}
    >
      <Form.Check type="radio" id={id} name="paymentMethod" value={method.value} checked={checked} disabled={!method.available} onChange={onChange} aria-label={method.label} />
      <span className="av-icon-tile" style={{ width: 36, height: 36 }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="d-flex flex-column flex-grow-1">
        <span className="fs-14 fw-semibold text-ink">{method.label}</span>
        <span className="fs-12 text-slate-500">{method.description}</span>
      </span>
      {!method.available && <span className="av-soon-badge">Sắp ra mắt</span>}
    </label>
  )
}

// Màn hình thanh toán một gói: tóm tắt đơn hàng, chọn phương thức, đồng ý điều khoản rồi chuyển sang VNPay hoặc quét mã QR
export default function OwnerCheckoutPage({ mockMode = MOCK_MODE, qrPollMs = QR_POLL_MS }) {
  const { planId } = useParams()
  const navigate = useNavigate()
  const fetchCheckout = useCallback(() => loadCheckout(planId), [planId])
  const { data, error, loading, reload } = useAdminResource(fetchCheckout)
  const [method, setMethod] = useState('VNPay')
  const [agreed, setAgreed] = useState(false)
  // paying: null | 'redirect' | 'qr' (đang tạo giao dịch theo cách nào)
  const [paying, setPaying] = useState(null)
  const [payError, setPayError] = useState('')
  const [qrCheckout, setQrCheckout] = useState(null)

  if (error || (loading && !data)) {
    return (
      <div className="d-flex flex-column gap-4">
        <BackLink to="/owner/plans" label="Quay lại danh sách gói" />
        <AdminResourceState error={error} loading={loading} hasData={false} loadingText="Đang tải thông tin thanh toán..." onRetry={reload} />
      </div>
    )
  }

  const plan = data.plans.find((item) => String(item.planId) === planId)
  if (!plan) {
    return <Unavailable title="Không tìm thấy gói dịch vụ" message="Gói dịch vụ này không tồn tại hoặc đã ngừng bán. Hãy chọn một gói khác." />
  }

  const free = isFreePlan(plan)
  const current = data.subscription?.hasActiveSubscription ? data.subscription.subscription : null
  // Gõ thẳng địa chỉ thanh toán cũng không vượt được quy tắc đổi gói (BE vẫn kiểm tra lại)
  // Có báo giá của BE thì BE quyết định; lý do tại chỗ (có ngày giờ dễ đọc) được ưu tiên hiển thị. Không có báo giá thì dùng quy tắc tại chỗ.
  const quote = data.quote
  const change = getPlanChange({ plan, subscription: current })
  const blocked = quote ? !quote.allowed : !change.allowed
  if (blocked) {
    const reason = (!change.allowed ? change.reason : null) ?? quote?.reasonMessage
    return <Unavailable title="Chưa thể chọn gói này" message={reason ?? 'Gói này hiện không thể chọn. Hãy quay lại danh sách gói.'} />
  }
  const changeType = quote?.changeType ?? { upgrade: 'Upgrade', renew: 'Renew', 'next-period': 'Scheduled' }[change.type] ?? null
  const queued = changeType === 'Renew' || changeType === 'Scheduled'
  const amountDue = quote ? quote.amountDue : Number(plan.price)
  const renewing = current?.plan?.planId === plan.planId
  const canPay = agreed && (free || method === 'VNPay') && paying === null

  // Gọi API checkout. Nếu cùng gói đang có giao dịch Pending còn hạn (< 15 phút) thì dùng lại đúng link VNPay cũ để không sinh thêm dòng Pending.
  const startCheckout = async (mode, { forceNew = false } = {}) => {
    setPaying(mode)
    setPayError('')
    try {
      if (free) {
        await selectFreePlan(plan.planId)
        navigate('/owner/plans', { state: { notice: `Đã kích hoạt ${plan.planName} thành công.` } })
        return
      }
      if (forceNew) clearPendingCheckout(plan.planId, qrCheckout?.transactionCode)
      const cached = !forceNew ? getPendingCheckoutByPlan(plan.planId) : null
      const checkout = cached ?? (await createVnpayCheckout(plan.planId))
      if (!needsGatewayRedirect(checkout)) {
        navigate('/owner/plans', { state: { notice: `Đã kích hoạt ${plan.planName} thành công.` } })
        return
      }
      if (!cached) savePendingCheckout(plan.planId, checkout)
      if (mode === 'redirect') {
        // Giữ nút khóa cho tới khi trình duyệt rời trang để không tạo hai giao dịch
        redirectTo(checkout.paymentUrl)
        return
      }
      setQrCheckout(checkout)
      setPaying(null)
    } catch (caught) {
      setPaying(null)
      setPayError(checkoutErrorMessage(caught))
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (canPay) startCheckout('redirect')
  }

  return (
    <div className="d-flex flex-column gap-4">
      <BackLink to="/owner/plans" label="Quay lại danh sách gói" />

      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <CreditCard size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Thanh toán gói dịch vụ
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Kiểm tra thông tin đơn hàng, chọn phương thức rồi thanh toán trên trang VNPay hoặc quét mã QR bằng điện thoại.</p>
          </div>
        </div>
      </section>

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      <form className="row g-4" onSubmit={handleSubmit} noValidate>
        <div className="col-12 col-lg-7 d-flex flex-column gap-4">
          <section className="av-panel d-flex flex-column gap-3" aria-labelledby="checkout-plan-title">
            <p className="mb-0 av-section-title">GÓI ĐÃ CHỌN</p>
            <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2">
              <h2 id="checkout-plan-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 18 }}>
                {plan.planName}
              </h2>
              <Link to="/owner/plans" className="fs-12">
                Đổi gói khác
              </Link>
            </div>
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2 fs-13 text-slate-600">
              <li className="d-flex align-items-center gap-2">
                <Vault size={14} aria-hidden="true" className="text-brand" />
                {`Tối đa ${plan.maxVaults} kho`}
              </li>
              <li className="d-flex align-items-center gap-2">
                <HardDrive size={14} aria-hidden="true" className="text-brand" />
                {`Dung lượng ${formatStorage(plan.maxStorageBytes)}`}
              </li>
              <li className="d-flex align-items-center gap-2">
                <CalendarClock size={14} aria-hidden="true" className="text-brand" />
                {`Thời hạn ${formatDuration(plan.durationDays)} kể từ khi thanh toán thành công`}
              </li>
            </ul>
          </section>

          <section className="av-panel d-flex flex-column gap-3" aria-labelledby="checkout-method-title">
            <h2 id="checkout-method-title" className="mb-0 av-section-title">
              PHƯƠNG THỨC THANH TOÁN
            </h2>
            {free ? (
              <p className="mb-0 av-info-box fs-13 text-slate-600" style={{ padding: 14 }}>
                Gói miễn phí không cần thanh toán. Gói sẽ được kích hoạt ngay khi bạn bấm &quot;Kích hoạt gói miễn phí&quot;.
              </p>
            ) : (
              <>
                <div className="d-flex flex-column gap-2" role="radiogroup" aria-labelledby="checkout-method-title">
                  {PAYMENT_METHODS.map((item) => (
                    <MethodOption key={item.value} method={item} checked={method === item.value} onChange={() => setMethod(item.value)} />
                  ))}
                </div>
                <p className="mb-0 fs-11 text-slate-500">Ví MoMo và chuyển khoản ngân hàng sẽ được hỗ trợ khi hệ thống mở thêm cổng thanh toán.</p>
              </>
            )}
          </section>

          {current && (
            <Alert variant="warning" className="av-alert mb-0 d-flex gap-2">
              <AlertTriangle size={16} aria-hidden="true" className="flex-shrink-0 mt-1" />
              <span>
                {changeType === 'Upgrade'
                  ? `Bạn đang dùng gói ${current.plan?.planName ?? 'hiện tại'} (hết hạn ${formatPaymentDate(current.endDate)}). Trong 3 ngày đầu bạn chỉ trả phần chênh lệch; khi thanh toán thành công, gói ${current.plan?.planName ?? 'hiện tại'} kết thúc ngay và gói ${plan.planName} chạy đủ ${formatDuration(plan.durationDays)} kể từ hôm nay. Phần chưa dùng của gói cũ không được hoàn tiền.`
                  : renewing && queued
                    ? `Bạn đang dùng gói ${plan.planName} (hết hạn ${formatPaymentDate(current.endDate)}). Gia hạn: kỳ mới sẽ bắt đầu sau khi kỳ hiện tại kết thúc, bạn không mất ngày đang còn.`
                    : queued
                      ? `Bạn đang dùng gói ${current.plan?.planName ?? 'hiện tại'} (hết hạn ${formatPaymentDate(current.endDate)}). Gói ${plan.planName} sẽ bắt đầu sau khi gói ${current.plan?.planName ?? 'hiện tại'} kết thúc; đến lúc đó bạn vẫn dùng gói hiện tại bình thường. Đã thanh toán là không hoàn tiền.`
                      : renewing
                        ? `Bạn đang dùng gói ${plan.planName} (hết hạn ${formatPaymentDate(current.endDate)}). Thanh toán lần này sẽ kích hoạt một kỳ mới thay cho kỳ hiện tại.`
                        : `Bạn đang dùng gói ${current.plan?.planName ?? 'hiện tại'} (hết hạn ${formatPaymentDate(current.endDate)}). ${free ? 'Khi kích hoạt' : 'Khi thanh toán thành công'}, gói này sẽ hết hạn và gói ${plan.planName} có hiệu lực ngay.`}
              </span>
            </Alert>
          )}
        </div>

        <div className="col-12 col-lg-5">
          <section className="av-panel d-flex flex-column gap-3" aria-labelledby="checkout-summary-title">
            <h2 id="checkout-summary-title" className="mb-0 fw-bold text-ink" style={{ fontSize: 16 }}>
              Tóm tắt đơn hàng
            </h2>
            <dl className="mb-0 d-flex flex-column gap-2 fs-13">
              <SummaryRow label="Gói dịch vụ">{plan.planName}</SummaryRow>
              <SummaryRow label="Thời hạn">{formatDuration(plan.durationDays)}</SummaryRow>
              {queued ? (
                <>
                  <SummaryRow label="Bắt đầu">{formatPaymentDate(quote?.startsAt ?? current?.endDate)}</SummaryRow>
                  <SummaryRow label="Hiệu lực đến">{formatPaymentDate(quote?.endsAt ?? estimatedEndDate(plan.durationDays, new Date(current?.endDate).getTime()))}</SummaryRow>
                </>
              ) : (
                <SummaryRow label="Hiệu lực dự kiến">{`đến ${formatPaymentDate(quote?.endsAt ?? estimatedEndDate(plan.durationDays))}`}</SummaryRow>
              )}
              <SummaryRow label="Đơn giá">{formatPlanPrice(plan)}</SummaryRow>
              {changeType === 'Upgrade' && <SummaryRow label="Phần chênh lệch">{`${formatVnd(plan.price)} − ${formatVnd(current?.plan?.price ?? 0)}`}</SummaryRow>}
              <hr className="my-1" />
              <SummaryRow label="Tổng thanh toán" strong>
                {formatVnd(amountDue)}
              </SummaryRow>
            </dl>

            {qrCheckout ? (
              <VnpayQrPanel
                key={qrCheckout.transactionCode}
                checkout={qrCheckout}
                pollMs={qrPollMs}
                onNewCode={() => startCheckout('qr', { forceNew: true })}
                onCancel={() => setQrCheckout(null)}
              />
            ) : (
              <>
                <Form.Check
                  id="checkout-agree"
                  className="fs-12 text-slate-600"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  label="Tôi đã kiểm tra thông tin đơn hàng và đồng ý với điều khoản sử dụng dịch vụ."
                />

                <Button type="submit" variant="primary" className="av-btn av-btn-md w-100" disabled={!canPay}>
                  <Lock size={16} aria-hidden="true" />
                  {free
                    ? paying === 'redirect'
                      ? 'Đang kích hoạt...'
                      : 'Kích hoạt gói miễn phí'
                    : paying === 'redirect'
                      ? 'Đang chuyển tới VNPay...'
                      : `Thanh toán ${formatVnd(amountDue)}`}
                </Button>
                {!free && (
                  <Button type="button" variant="light" className="av-btn av-btn-md w-100 border" disabled={!canPay} onClick={() => startCheckout('qr')}>
                    <QrCode size={16} aria-hidden="true" />
                    {paying === 'qr' ? 'Đang tạo mã QR...' : 'Quét mã QR bằng điện thoại'}
                  </Button>
                )}
              </>
            )}

            {payError && <Alert variant="danger" className="av-alert mb-0">{payError}</Alert>}

            {!free && (
              <p className="mb-0 d-flex align-items-center justify-content-center gap-2 fs-11 text-slate-500">
                <ShieldCheck size={13} aria-hidden="true" className="text-brand" />
                Giao dịch được mã hóa và xử lý bởi VNPay. Chúng tôi không lưu thông tin thẻ.
              </p>
            )}
          </section>
        </div>
      </form>
    </div>
  )
}
