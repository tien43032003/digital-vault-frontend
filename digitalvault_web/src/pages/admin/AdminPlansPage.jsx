import { CreditCard, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { getAdminPlans, updateAdminPlan } from '../../callapi/adminApi'
import AdminResourceState from '../../components/admin/AdminResourceState'
import DeleteInactivePlansModal from '../../components/admin/DeleteInactivePlansModal'
import DeletePlanModal from '../../components/admin/DeletePlanModal'
import PaymentTransactionsPanel from '../../components/admin/PaymentTransactionsPanel'
import PlanFormModal from '../../components/admin/PlanFormModal'
import AppToast from '../../components/common/AppToast'
import { useAdminResource } from '../../hooks/useAdminResource'
import { adminPlanErrorMessage, formatDuration, formatStorage, formatVnd, planFormToInput, planToForm } from '../../utils/payment'

const TABS = [
  { key: 'plans', label: 'Gói dịch vụ' },
  { key: 'transactions', label: 'Giao dịch thanh toán' },
]

// Trang "Gói dịch vụ & thanh toán" của Admin: quản lý gói (thêm, sửa, xóa, bật/tắt bán) và xem giao dịch của mọi người dùng
export default function AdminPlansPage() {
  const [tab, setTab] = useState('plans')
  const [dialog, setDialog] = useState(null) // { type: 'create' | 'edit' | 'delete', plan? }
  const [toast, setToast] = useState(null)
  // BE "xóa" gói bằng cách ngừng bán (giữ lại để lịch sử giao dịch còn tham chiếu), nên tách hai nhóm: đang bán / ngừng bán
  const [planView, setPlanView] = useState('active')
  const [resellingId, setResellingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const { data: allPlans, error, loading, reload, apply } = useAdminResource(getAdminPlans)
  const activePlans = allPlans ? allPlans.filter((plan) => plan.isActive) : []
  const inactivePlans = allPlans ? allPlans.filter((plan) => !plan.isActive) : []
  const plans = allPlans && (planView === 'active' ? activePlans : inactivePlans)
  const PLAN_VIEWS = [
    { key: 'active', label: 'Đang bán', count: activePlans.length },
    { key: 'inactive', label: 'Ngừng bán', count: inactivePlans.length },
  ]

  const closeDialog = () => setDialog(null)
  const closeToast = useCallback(() => setToast(null), [])

  const handleSaved = (plan, isNew) => {
    closeDialog()
    setToast({ title: isNew ? 'Đã tạo gói dịch vụ' : 'Đã cập nhật gói dịch vụ', detail: plan?.planName })
    reload()
  }

  const handleDeleted = async (plan) => {
    closeDialog()
    if (plan.isActive) {
      setToast({ title: 'Đã ngừng bán gói dịch vụ', detail: `${plan.planName} · lịch sử giao dịch vẫn được giữ` })
      reload()
      return
    }
    // Gói đã ngừng bán: tải lại danh sách để biết máy chủ đã xóa hẳn hay vẫn giữ gói (gói đã có giao dịch)
    try {
      const fresh = await getAdminPlans()
      apply(fresh)
      const kept = fresh.some((item) => item.planId === plan.planId)
      setToast(
        kept
          ? { title: 'Máy chủ vẫn giữ gói này', detail: `${plan.planName} · gói chưa bị xóa hẳn, có thể đã có giao dịch` }
          : { title: 'Đã xóa vĩnh viễn gói dịch vụ', detail: plan.planName },
      )
    } catch {
      setToast({ title: 'Đã gửi yêu cầu xóa gói', detail: plan.planName })
      reload()
    }
  }

  // Sau khi xóa hàng loạt: báo số gói đã xóa và số gói được giữ lại, rồi tải lại danh sách
  const handleInactiveDeleted = (result) => {
    closeDialog()
    const kept = result.skippedPlanIds?.length ?? 0
    setToast({ title: `Đã xóa ${result.deletedCount} gói ngừng bán`, detail: kept > 0 ? `${kept} gói được giữ lại vì đã có giao dịch` : undefined })
    reload()
  }

  // Bật bán lại một gói đã ngừng bán: gửi lại đúng thông tin cũ, chỉ đổi isActive
  const handleResell = async (plan) => {
    setResellingId(plan.planId)
    setActionError('')
    try {
      await updateAdminPlan(plan.planId, { ...planFormToInput(planToForm(plan), plan), isActive: true })
      setToast({ title: 'Đã bán lại gói dịch vụ', detail: plan.planName })
      reload()
    } catch (caught) {
      setActionError(adminPlanErrorMessage(caught, 'save'))
    } finally {
      setResellingId(null)
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
              Gói dịch vụ &amp; thanh toán
            </h1>
            <p className="mb-0 fs-12 text-slate-500">Quản lý các gói bán cho Owner và theo dõi giao dịch thanh toán qua cổng VNPay.</p>
          </div>
        </div>
        {tab === 'plans' && (
          <div className="d-flex align-items-center gap-2">
            <Button type="button" variant="light" className="av-btn av-btn-sm border" disabled={loading} onClick={reload}>
              <RefreshCw size={16} aria-hidden="true" />
              Làm mới
            </Button>
            <Button type="button" variant="primary" className="av-btn av-btn-sm" onClick={() => setDialog({ type: 'create' })}>
              <Plus size={16} aria-hidden="true" />
              Thêm gói
            </Button>
          </div>
        )}
      </section>

      <div className="av-tabs" role="group" aria-label="Chọn nội dung">
        {TABS.map((item) => (
          <button key={item.key} type="button" className="av-tab" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'plans' ? (
        <section className="av-panel d-flex flex-column gap-3" aria-label="Gói dịch vụ">
          <AdminResourceState error={error} loading={loading} hasData={Boolean(plans)} loadingText="Đang tải danh sách gói dịch vụ..." onRetry={reload} />

          {allPlans && (
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div className="av-tabs" role="group" aria-label="Nhóm gói dịch vụ">
                {PLAN_VIEWS.map((item) => (
                  <button key={item.key} type="button" className="av-tab" aria-pressed={planView === item.key} onClick={() => setPlanView(item.key)}>
                    {`${item.label} (${item.count})`}
                  </button>
                ))}
              </div>
              {planView === 'inactive' && inactivePlans.length > 0 && (
                <button type="button" className="av-ghost-btn" onClick={() => setDialog({ type: 'delete-inactive' })}>
                  <Trash2 size={14} aria-hidden="true" />
                  Xóa tất cả gói ngừng bán
                </button>
              )}
            </div>
          )}

          {actionError && (
            <Alert variant="danger" className="av-alert mb-0" dismissible onClose={() => setActionError('')}>
              {actionError}
            </Alert>
          )}

          {plans && plans.length === 0 && (
            <p className="av-empty mb-0">
              {planView === 'active'
                ? allPlans.length === 0
                  ? 'Chưa có gói dịch vụ nào. Bấm "Thêm gói" để tạo gói đầu tiên.'
                  : 'Chưa có gói nào đang bán.'
                : 'Chưa có gói nào ngừng bán.'}
            </p>
          )}

          {plans && plans.length > 0 && (
            <div className="table-responsive" aria-busy={loading}>
              <table className="table align-middle mb-0 fs-13" aria-label="Danh sách gói dịch vụ">
                <thead>
                  <tr className="fs-11 text-slate-500">
                    <th scope="col">Gói</th>
                    <th scope="col">Số kho tối đa</th>
                    <th scope="col">Dung lượng tối đa</th>
                    <th scope="col">Giá</th>
                    <th scope="col">Thời hạn</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col" className="text-end">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.planId}>
                      <td className="fw-semibold text-ink">{plan.planName}</td>
                      <td>{`${plan.maxVaults} kho`}</td>
                      <td>{formatStorage(plan.maxStorageBytes)}</td>
                      <td className="text-nowrap">{formatVnd(plan.price)}</td>
                      <td className="text-nowrap">{formatDuration(plan.durationDays)}</td>
                      <td>
                        <span className={`av-badge ${plan.isActive ? 'av-badge-ok' : 'av-badge-muted'}`}>{plan.isActive ? 'Đang bán' : 'Ngừng bán'}</span>
                      </td>
                      <td className="text-end text-nowrap">
                        <div className="d-inline-flex gap-2">
                          <button type="button" className="av-ghost-btn" aria-label={`Sửa gói ${plan.planName}`} onClick={() => setDialog({ type: 'edit', plan })}>
                            <Pencil size={14} aria-hidden="true" />
                            Sửa
                          </button>
                          {plan.isActive ? (
                            <button type="button" className="av-ghost-btn" aria-label={`Xóa gói ${plan.planName}`} onClick={() => setDialog({ type: 'delete', plan })}>
                              <Trash2 size={14} aria-hidden="true" />
                              Xóa
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="av-ghost-btn is-brand"
                              aria-label={`Bán lại gói ${plan.planName}`}
                              disabled={resellingId === plan.planId}
                              onClick={() => handleResell(plan)}
                            >
                              <RotateCcw size={14} aria-hidden="true" />
                              {resellingId === plan.planId ? 'Đang xử lý...' : 'Bán lại'}
                            </button>
                          )}
                          {!plan.isActive && (
                            <button type="button" className="av-ghost-btn" aria-label={`Xóa vĩnh viễn gói ${plan.planName}`} onClick={() => setDialog({ type: 'delete', plan })}>
                              <Trash2 size={14} aria-hidden="true" />
                              Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="av-panel" aria-label="Giao dịch thanh toán">
          <PaymentTransactionsPanel />
        </section>
      )}

      {dialog?.type === 'create' && <PlanFormModal onClose={closeDialog} onSaved={handleSaved} />}
      {dialog?.type === 'edit' && <PlanFormModal plan={dialog.plan} onClose={closeDialog} onSaved={handleSaved} />}
      {dialog?.type === 'delete' && <DeletePlanModal plan={dialog.plan} onClose={closeDialog} onDeleted={handleDeleted} />}
      {dialog?.type === 'delete-inactive' && <DeleteInactivePlansModal count={inactivePlans.length} onClose={closeDialog} onFinished={handleInactiveDeleted} />}

      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}
