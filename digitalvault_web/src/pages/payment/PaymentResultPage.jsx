import { CheckCircle2, Clock, SearchX, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import { Link, useSearchParams } from 'react-router-dom'
import { getMyTransactions } from '../../callapi/paymentApi'
import BrandLogo from '../../components/common/BrandLogo'
import { useAdminResource } from '../../hooks/useAdminResource'
import { useAuth } from '../../hooks/useAuth'
import { formatPaymentDateTime, formatVnd } from '../../utils/payment'
import { getPortalPreference } from '../../utils/portalPreference'
import { getDefaultRouteForRoles } from '../../utils/roleRoutes'
import { getTokens } from '../../utils/tokenStorage'

const OUTCOME = {
  Success: { icon: CheckCircle2, color: 'text-brand', title: 'Thanh toán thành công', note: 'Gói dịch vụ mới đã được kích hoạt. Gói đang dùng trước đó (nếu có) sẽ hết hạn.' },
  Failed: { icon: XCircle, color: 'text-danger', title: 'Thanh toán thất bại', note: 'Giao dịch không thành công hoặc đã bị hủy. Tài khoản của bạn không bị trừ tiền cho giao dịch này.' },
  Pending: { icon: Clock, color: 'text-slate-500', title: 'Đang chờ xác nhận', note: 'Hệ thống đang chờ VNPay xác nhận giao dịch.' },
}
const PENDING_POLLING_NOTE = 'Hệ thống đang chờ VNPay xác nhận giao dịch. Trang sẽ tự kiểm tra lại, bạn không cần tải lại trang.'
const PENDING_GAVE_UP_NOTE = 'VNPay chưa xác nhận giao dịch. Nếu bạn đã thanh toán, hãy bấm Kiểm tra lại sau ít phút; kết quả cuối cùng do VNPay thông báo cho hệ thống.'
const UNVERIFIED_NOTE = 'Kết quả này chưa được đối chiếu với tài khoản của bạn.'
const VERIFY_FAILED_NOTE = 'Chưa đối chiếu được với máy chủ. Hãy xem lại trong lịch sử giao dịch của bạn.'

// Mã giao dịch của BE là chuỗi chữ-số; chặn mọi giá trị lạ trước khi hiển thị hay gửi đi
const VALID_CODE = /^[A-Za-z0-9_-]{6,64}$/

function Shell({ children }) {
  return (
    <main className="min-vh-100 d-flex align-items-center justify-content-center p-4">
      <section className="av-panel d-flex flex-column gap-4 w-100" style={{ maxWidth: 520 }}>
        <BrandLogo />
        {children}
      </section>
    </main>
  )
}

// workspace là khu làm việc của người đã đăng nhập: có thì dẫn thẳng vào đó, vì "trang chủ" là trang giới thiệu nên dễ tưởng đã bị đăng xuất
function Links({ showLogin = false, workspace = null }) {
  return (
    <div className="d-flex flex-wrap justify-content-center gap-3 fs-13">
      {showLogin && <Link to="/">Đăng nhập để đối chiếu</Link>}
      <Link to="/owner/plans">Xem các gói dịch vụ</Link>
      {workspace ? <Link to={workspace}>Vào khu làm việc</Link> : <Link to="/">Về trang chủ</Link>}
    </div>
  )
}

// Tìm giao dịch trong lịch sử của chính người dùng đang đăng nhập (BE chưa có API xem một giao dịch theo mã)
async function findMyTransaction(code) {
  const page = await getMyTransactions({ page: 1, pageSize: 50 })
  return { item: page.items.find((row) => row.transactionCode === code) ?? null }
}

// Trang BE chuyển khách về sau khi VNPay trả kết quả: /payment-result?status=...&code=...
// status và code nằm trên địa chỉ nên ai cũng sửa tay được: khi đã đăng nhập, FE đối chiếu với lịch sử giao dịch của tài khoản và tin kết quả của máy chủ.
export default function PaymentResultPage({ pollIntervalMs = 3000, maxPolls = 10 }) {
  const { user } = useAuth()
  const workspace = user ? getDefaultRouteForRoles(user.roles, getPortalPreference()) : null
  const [searchParams] = useSearchParams()
  // Ưu tiên status và code của BE; nếu BE chuyển hướng kèm nguyên tham số vnp_* thì lấy mã giao dịch từ vnp_TxnRef và suy ra kết quả tạm từ vnp_ResponseCode (vẫn chỉ là thông tin chưa đối chiếu)
  const rawRef = searchParams.get('vnp_TxnRef')
  const hasBackendResult = searchParams.get('status') !== null || searchParams.get('code') !== null
  const code = hasBackendResult ? searchParams.get('code') : rawRef
  const rawResponse = searchParams.get('vnp_ResponseCode')
  const queryStatus = hasBackendResult ? searchParams.get('status') : rawRef && rawResponse ? (rawResponse === '00' ? 'Success' : 'Failed') : rawRef ? 'Pending' : null
  const valid = Object.hasOwn(OUTCOME, queryStatus ?? '') && VALID_CODE.test(code ?? '')
  const canVerify = valid && Boolean(getTokens())

  // data = null là chưa đối chiếu (chưa đăng nhập); { item } là đã hỏi máy chủ, item = null nghĩa là không có giao dịch này trong tài khoản
  const fetcher = useMemo(() => () => (canVerify ? findMyTransaction(code) : Promise.resolve(null)), [canVerify, code])
  const { data, error, errorStatus, loading, reload } = useAdminResource(fetcher)
  const [polls, setPolls] = useState(0)
  const item = data?.item
  const polling = Boolean(item) && item.status === 'Pending' && polls < maxPolls

  // data đổi tham chiếu sau mỗi lần tải nên hiệu ứng này tự đặt lại hẹn giờ cho lần hỏi kế tiếp
  useEffect(() => {
    if (!polling) return undefined
    const timer = setTimeout(() => {
      setPolls((count) => count + 1)
      reload()
    }, pollIntervalMs)
    return () => clearTimeout(timer)
  }, [polling, data, pollIntervalMs, reload])

  const handleRecheck = () => {
    setPolls(0)
    reload()
  }

  if (!valid) {
    return (
      <Shell>
        <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20 }}>
          Không có thông tin thanh toán
        </h1>
        <p className="mb-0 fs-13 text-slate-500">Địa chỉ này không chứa kết quả thanh toán hợp lệ. Hãy chọn gói dịch vụ và thanh toán lại.</p>
        <Links workspace={workspace} />
      </Shell>
    )
  }

  if (canVerify && loading && !data && !error) {
    return (
      <Shell>
        <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500 mb-0">
          <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
          Đang đối chiếu giao dịch...
        </p>
      </Shell>
    )
  }

  if (data && item === null) {
    return (
      <Shell>
        <div className="d-flex flex-column align-items-center gap-2 text-center">
          <SearchX size={48} aria-hidden="true" className="text-slate-500" />
          <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 22 }}>
            Không tìm thấy giao dịch
          </h1>
          <p className="mb-0 fs-13 text-slate-500">Giao dịch này không thuộc tài khoản đang đăng nhập hoặc chưa được ghi nhận.</p>
        </div>
        <Links workspace={workspace} />
      </Shell>
    )
  }

  // Có kết quả từ máy chủ thì dùng nó; chưa đối chiếu được thì tạm hiện theo địa chỉ và nói rõ
  const status = item ? item.status : queryStatus
  const outcome = OUTCOME[status] ?? OUTCOME.Pending
  const Icon = outcome.icon
  const unauthenticated = !item && (!canVerify || errorStatus === 401)
  const verifyFailed = !item && canVerify && Boolean(error) && errorStatus !== 401
  const note = status === 'Pending' && item ? (polling ? PENDING_POLLING_NOTE : PENDING_GAVE_UP_NOTE) : outcome.note

  return (
    <Shell>
      <div className="d-flex flex-column align-items-center gap-2 text-center">
        <Icon size={48} aria-hidden="true" className={outcome.color} />
        <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 22 }}>
          {outcome.title}
        </h1>
        <p className="mb-0 fs-13 text-slate-500">{note}</p>
        {polling && (
          <p role="status" className="mb-0 d-flex align-items-center gap-2 fs-12 text-slate-500">
            <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
            Đang tự động kiểm tra lại...
          </p>
        )}
        {item && status === 'Pending' && !polling && (
          <Button type="button" variant="light" size="sm" className="border" disabled={loading} onClick={handleRecheck}>
            Kiểm tra lại
          </Button>
        )}
        {unauthenticated && <p className="mb-0 fs-12 text-slate-500">{UNVERIFIED_NOTE}</p>}
        {verifyFailed && <p className="mb-0 fs-12 text-slate-500">{VERIFY_FAILED_NOTE}</p>}
      </div>
      <dl className="mb-0 d-flex flex-column gap-2 fs-13">
        <div className="d-flex justify-content-between gap-3">
          <dt className="text-slate-500">Mã giao dịch</dt>
          <dd className="mb-0 font-mono text-ink text-break">{code}</dd>
        </div>
        {item && (
          <>
            {item.planName && (
              <div className="d-flex justify-content-between gap-3">
                <dt className="text-slate-500">Gói dịch vụ</dt>
                <dd className="mb-0 text-ink">{item.planName}</dd>
              </div>
            )}
            <div className="d-flex justify-content-between gap-3">
              <dt className="text-slate-500">Số tiền</dt>
              <dd className="mb-0 fw-semibold text-ink">{formatVnd(item.amount)}</dd>
            </div>
            <div className="d-flex justify-content-between gap-3">
              <dt className="text-slate-500">Thời gian</dt>
              <dd className="mb-0 text-ink">{formatPaymentDateTime(item.createdAt)}</dd>
            </div>
          </>
        )}
      </dl>
      <Links showLogin={unauthenticated} workspace={workspace} />
    </Shell>
  )
}
