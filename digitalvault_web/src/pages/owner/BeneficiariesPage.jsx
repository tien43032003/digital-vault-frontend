import { Briefcase, Plus, Search, Users } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Form } from 'react-bootstrap'
import AppToast from '../../components/common/AppToast'
import AddBeneficiaryModal from '../../components/owner/AddBeneficiaryModal'
import BeneficiaryPersonCard from '../../components/owner/BeneficiaryPersonCard'
import EditAllocationModal from '../../components/owner/EditAllocationModal'
import RemoveBeneficiaryModal from '../../components/owner/RemoveBeneficiaryModal'
import { useOwnerCatalog } from '../../hooks/useOwnerCatalog'
import { filterPeople, getAssignableAssets, groupBeneficiariesByPerson } from '../../utils/catalog'
import { isOwnerLockedByHandover, isVaultLockedByHandover } from '../../utils/handover'

const pad2 = (value) => String(value).padStart(2, '0')

function StatBox({ label, icon: Icon, tone, children }) {
  return (
    <div role="group" aria-label={label} className="av-stat">
      <div style={{ minWidth: 0 }}>
        <p className="av-stat-label">{label}</p>
        {children}
      </div>
      <span className={`av-stat-icon ${tone}`}>
        <Icon size={18} aria-hidden="true" />
      </span>
    </div>
  )
}

// Các hộp thoại sửa/gỡ chỉ làm việc với phân bổ đang hiệu lực, bỏ phân bổ chờ xác nhận
const onlyActive = (person) => ({ ...person, items: person.items.filter((item) => item.status !== 'Pending') })

// Trang "Người thụ hưởng": gom theo từng người, tìm kiếm và chỉ định thêm người thụ hưởng
export default function BeneficiariesPage() {
  const { status, error, vaults, selectedVault, selectVault, assets, beneficiaries, handovers, reload } = useOwnerCatalog()
  const [query, setQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [action, setAction] = useState(null)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  const people = useMemo(() => groupBeneficiariesByPerson(assets, beneficiaries), [assets, beneficiaries])
  const visiblePeople = useMemo(() => filterPeople(people, query), [people, query])
  const assignableAssets = useMemo(() => getAssignableAssets(assets), [assets])
  const allocatedAssetCount = useMemo(() => new Set(beneficiaries.map((b) => b.assetId)).size, [beneficiaries])
  const lockedByHandover = useMemo(
    () => (selectedVault ? isVaultLockedByHandover(handovers, selectedVault.vaultId) : false) || isOwnerLockedByHandover(handovers),
    [handovers, selectedVault],
  )

  const finishAction = (title) => {
    setAction(null)
    setToast({ title })
    reload()
  }

  const handleAssigned = () => {
    setIsModalOpen(false)
    reload()
  }

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải danh sách người thụ hưởng...
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

  const canAdd = assignableAssets.length > 0 && !lockedByHandover

  return (
    <div className="d-flex flex-column gap-4">
      <section className="av-panel av-banner">
        <div>
          <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
            Người thụ hưởng
          </h1>
          <p className="mb-0 fs-12 text-slate-500">Những người được chỉ định thừa hưởng tài sản số của bạn và tỷ lệ phân bổ.</p>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2">
          {vaults.length >= 2 && selectedVault && (
            <Form.Select
              size="sm"
              aria-label="Chọn kho"
              value={selectedVault.vaultId}
              onChange={(event) => selectVault(Number(event.target.value))}
              style={{ width: 'auto', maxWidth: 220 }}
            >
              {vaults.map((item) => (
                <option key={item.vaultId} value={item.vaultId}>
                  {item.name}
                </option>
              ))}
            </Form.Select>
          )}
          <Button
            type="button"
            variant="primary"
            className="av-btn av-btn-sm"
            disabled={!canAdd}
            title={canAdd ? undefined : 'Chưa có tài sản nào còn phần trăm chưa phân bổ'}
            onClick={() => setIsModalOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Thêm người thụ hưởng
          </Button>
          {!canAdd && assets.length > 0 && !lockedByHandover && (
            <p role="note" className="w-100 mb-0 fs-12 text-slate-500 text-end">
              Tất cả tài sản trong kho đã phân bổ đủ 100%. Hãy bấm &quot;Sửa phân quyền&quot; để giảm tỷ lệ hiện tại hoặc thêm tài sản mới trước khi thêm người thụ hưởng.
            </p>
          )}
        </div>
      </section>

      <div className="av-stat-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <StatBox label="NGƯỜI THỤ HƯỞNG" icon={Users} tone="is-brand">
          <p className="mb-0 mt-1">
            <span className="av-stat-value">{pad2(people.length)}</span>
            <span className="av-stat-unit">người</span>
          </p>
        </StatBox>
        <StatBox label="TÀI SẢN ĐÃ PHÂN BỔ" icon={Briefcase} tone="is-amber">
          <p className="mb-0 mt-1">
            <span className="av-stat-value">{`${pad2(allocatedAssetCount)}/${pad2(assets.length)}`}</span>
            <span className="av-stat-unit">tài sản</span>
          </p>
        </StatBox>
      </div>

      <section className="av-panel d-flex flex-column gap-3" aria-label="Danh sách người thụ hưởng">
        {people.length === 0 ? (
          <p className="av-empty mb-0">Bạn chưa có người thụ hưởng nào.</p>
        ) : (
          <>
            <div className="av-search">
              <Search size={16} className="av-field-icon" aria-hidden="true" />
              <Form.Control
                type="search"
                aria-label="Tìm người thụ hưởng"
                placeholder="Tìm theo tên người thụ hưởng hoặc tài sản..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="av-input av-input-icon"
              />
            </div>
            {visiblePeople.length === 0 ? (
              <p className="av-empty mb-0">Không tìm thấy người thụ hưởng phù hợp.</p>
            ) : (
              <div>
                {visiblePeople.map((person) => (
                  <BeneficiaryPersonCard
                    key={person.beneficiaryId}
                    person={person}
                    onEdit={(target) => setAction({ type: 'edit', person: onlyActive(target) })}
                    onRemove={(target) => setAction({ type: 'remove', person: onlyActive(target) })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <AddBeneficiaryModal
        open={isModalOpen}
        assets={assignableAssets}
        onClose={() => setIsModalOpen(false)}
        onAssigned={handleAssigned}
      />
      {action?.type === 'edit' && (
        <EditAllocationModal
          person={action.person}
          beneficiaries={beneficiaries}
          onClose={() => setAction(null)}
          onChanged={() => finishAction('Đã cập nhật phân quyền')}
        />
      )}
      {action?.type === 'remove' && (
        <RemoveBeneficiaryModal
          person={action.person}
          onClose={() => setAction(null)}
          onRemoved={() => finishAction('Đã xóa người thụ hưởng')}
        />
      )}
      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} />
    </div>
  )
}
