import { Clock, HeartPulse } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { useSearchParams } from 'react-router-dom'
import { confirmAlive } from '../../callapi/ownerApi'
import AppToast from '../../components/common/AppToast'
import MockNotice from '../../components/common/MockNotice'
import PingConfirmModal from '../../components/owner/PingConfirmModal'
import { useProofOfLife } from '../../hooks/useProofOfLife'
import { MOCK_MODE } from '../../mocks/mode'
import { LIFE_CONFIRMATION_DEFAULTS, confirmAliveErrorMessage } from '../../utils/lifeConfirmation'
import { formatDateTime } from '../../utils/proofOfLife'

// Lỗi mất kết nối (status 0) được tách riêng với lỗi do máy chủ trả về
const toActionError = (error) => (error?.status === 0 ? { network: true } : { network: false, message: confirmAliveErrorMessage(error) })

function StatBox({ label, children }) {
  return (
    <div role="group" aria-label={label} className="av-stat">
      <div style={{ minWidth: 0 }}>
        <p className="av-stat-label">{label}</p>
        {children}
      </div>
    </div>
  )
}

function ProofOfLifeContent({ data, lockedByHandover = false, apply, mockMode, autoPing }) {
  const [ping, setPing] = useState({ busy: false, error: null })
  const [pingOpen, setPingOpen] = useState(Boolean(autoPing && !lockedByHandover))
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  const handlePing = async () => {
    setPing({ busy: true, error: null })
    try {
      const result = await confirmAlive()
      apply(result)
      setPing({ busy: false, error: null })
      setPingOpen(false)
      setToast({ title: 'Điểm danh thành công!', detail: `Đã ghi nhận lúc ${formatDateTime(result.lastConfirmedAliveAt)}` })
    } catch (error) {
      setPing({ busy: false, error: toActionError(error) })
    }
  }

  const closePing = () => {
    if (ping.busy) return
    setPingOpen(false)
    setPing({ busy: false, error: null })
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <HeartPulse size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-0 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              Điểm danh sự sống
            </h1>
            <p className="mt-1 mb-0 fs-12 text-slate-500">Định kỳ xác nhận bạn vẫn còn sống để Người thi hành và người xác minh pháp lý nắm được tình trạng của bạn.</p>
          </div>
        </div>
        <Button type="button" variant="primary" className="av-btn av-btn-sm" disabled={lockedByHandover} onClick={() => setPingOpen(true)}>
          <HeartPulse size={16} aria-hidden="true" />
          Tôi vẫn còn sống
        </Button>
      </section>

      {lockedByHandover && (
        <Alert variant="warning" className="av-alert mb-0">
          Tài khoản đang có hồ sơ bàn giao đính kèm giấy chứng tử nên chức năng điểm danh sự sống đã bị khóa. Vui lòng liên hệ Người thi hành để xử lý hồ sơ.
        </Alert>
      )}

      <MockNotice mode={mockMode === 'full' ? mockMode : 'off'} />

      <div className="av-stat-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <StatBox label="LẦN XÁC NHẬN GẦN NHẤT">
          <p className="mb-0 mt-1 av-stat-value" style={{ fontSize: 18 }}>
            {data.lastConfirmedAliveAt ? formatDateTime(data.lastConfirmedAliveAt) : 'Bạn chưa xác nhận lần nào'}
          </p>
        </StatBox>
        <StatBox label="CHU KỲ MẶC ĐỊNH">
          <p className="mb-0 mt-1 av-stat-value" style={{ fontSize: 18 }}>{`${LIFE_CONFIRMATION_DEFAULTS.frequencyDays} ngày`}</p>
        </StatBox>
        <StatBox label="THỜI GIAN ÂN HẠN MẶC ĐỊNH">
          <p className="mb-0 mt-1 av-stat-value" style={{ fontSize: 18 }}>{`${LIFE_CONFIRMATION_DEFAULTS.gracePeriodDays} ngày`}</p>
        </StatBox>
      </div>

      <p className="av-notice mb-0">Chu kỳ và thời gian ân hạn do hệ thống đặt sẵn, hiện chưa thể thay đổi.</p>

      <section className="av-panel" aria-labelledby="pol-info-title">
        <h2 id="pol-info-title" className="mb-2 fw-bold text-ink d-flex align-items-center gap-2" style={{ fontSize: 16 }}>
          <Clock size={16} aria-hidden="true" />
          Xác nhận còn sống hoạt động thế nào?
        </h2>
        <ul className="mb-0 fs-13 text-slate-600" style={{ lineHeight: 1.7 }}>
          <li>Mỗi lần bấm, hệ thống ghi lại thời điểm xác nhận theo giờ máy chủ.</li>
          <li>Người thi hành và người xác minh pháp lý được giao hồ sơ sẽ thấy lần xác nhận gần nhất của bạn.</li>
          <li>Khi hồ sơ bàn giao đã có giấy chứng tử đang xử lý hoặc đã được duyệt pháp lý, bạn không thể xác nhận; hãy liên hệ Người thi hành để xử lý hồ sơ.</li>
        </ul>
      </section>

      <PingConfirmModal open={pingOpen} isSubmitting={ping.busy} error={ping.error} onConfirm={handlePing} onClose={closePing} />
      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}

// Trang "Điểm danh sự sống": xem lần xác nhận còn sống gần nhất và bấm xác nhận
export default function ProofOfLifePage({ mockMode = MOCK_MODE }) {
  const { status, data, lockedByHandover, error, reload, apply } = useProofOfLife()
  const [searchParams] = useSearchParams()

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải thông tin điểm danh...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between gap-3">
        <span>{error}</span>
        <Button type="button" variant="light" size="sm" className="border" onClick={reload}>
          Thử lại
        </Button>
      </Alert>
    )
  }

  return <ProofOfLifeContent data={data} lockedByHandover={lockedByHandover} apply={apply} mockMode={mockMode} autoPing={searchParams.get('ping') === '1'} />
}
