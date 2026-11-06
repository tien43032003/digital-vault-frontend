import { Activity, Plus, ShieldCheck } from 'lucide-react'
import { Button, Form } from 'react-bootstrap'

const STATUS_LABELS = { Active: 'Đang hoạt động', Closed: 'Đã đóng' }

// Banner đầu trang: thông tin kho đang chọn, bộ chọn kho (khi có từ 2 kho) và các nút hành động
export default function VaultBanner({
  vault,
  vaults,
  onSelectVault,
  onAddAsset,
  onCreateVault,
  onEditVault,
  onCloseVault,
  onCheckIn,
  lockedByHandover = false,
  ownerLockedByHandover = false,
}) {
  // Kho đã đóng hoặc đang có hồ sơ bàn giao không còn sửa được (BE trả 409 cho mọi thay đổi)
  const isActive = vault.status === 'Active'
  return (
    <section className="av-panel av-banner" aria-label="Thông tin kho">
      <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
        <span className="av-icon-tile">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="av-modal-tag av-mono-tag">KHO DI SẢN ĐANG ĐƯỢC BẢO VỆ</span>
            <span className="font-mono fs-10 text-slate-400">VAULT #{vault.vaultId}</span>
          </div>
          <h1 className="mt-1 mb-0 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
            {vault.name}
          </h1>
          <p className="mt-1 mb-0 fs-12 text-slate-500">
            Trạng thái kho: <strong className="text-ink">{STATUS_LABELS[vault.status] ?? vault.status}</strong>
            {vault.description ? ` · ${vault.description}` : ''}
          </p>
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2">
        {vaults.length >= 2 && (
          <Form.Select
            size="sm"
            aria-label="Chọn kho"
            value={vault.vaultId}
            onChange={(event) => onSelectVault(Number(event.target.value))}
            style={{ width: 'auto', maxWidth: 220 }}
          >
            {vaults.map((item) => (
              <option key={item.vaultId} value={item.vaultId}>
                {item.name}
              </option>
            ))}
          </Form.Select>
        )}
        <button type="button" onClick={onCreateVault} disabled={ownerLockedByHandover} className="av-link-btn fs-12">
          Tạo kho mới
        </button>
        <button type="button" onClick={onEditVault} disabled={!isActive || lockedByHandover || ownerLockedByHandover} className="av-link-btn fs-12">
          Sửa kho
        </button>
        <button type="button" onClick={onCloseVault} disabled={!isActive || lockedByHandover || ownerLockedByHandover} className="av-link-btn fs-12">
          Đóng kho
        </button>
        <button type="button" onClick={onCheckIn} className="av-ghost-btn is-brand">
          <Activity size={14} aria-hidden="true" />
          Điểm danh ngay
        </button>
        <Button type="button" variant="primary" onClick={onAddAsset} disabled={!isActive || lockedByHandover || ownerLockedByHandover} className="av-btn av-btn-sm">
          <Plus size={16} aria-hidden="true" />
          Thêm tài sản mới
        </Button>
        {lockedByHandover && (
          <p role="note" className="w-100 mb-0 fs-12 text-slate-500 text-end">
            Kho này đang có hồ sơ bàn giao nên chưa thể thêm hoặc sửa tài sản. Hãy hủy hồ sơ ở mục Hồ sơ bàn giao (khi còn chờ Executor, bản nháp hoặc bị từ chối) để mở lại.
          </p>
        )}
      </div>
    </section>
  )
}
