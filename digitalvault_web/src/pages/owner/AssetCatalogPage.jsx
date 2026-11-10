import { Lock } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { getMySubscription } from '../../callapi/paymentApi'
import AppToast from '../../components/common/AppToast'
import AddAssetModal from '../../components/owner/AddAssetModal'
import AssetCard from '../../components/owner/AssetCard'
import AssetFilters from '../../components/owner/AssetFilters'
import ChoosePlanModal from '../../components/owner/ChoosePlanModal'
import CloseVaultModal from '../../components/owner/CloseVaultModal'
import CreateVaultModal from '../../components/owner/CreateVaultModal'
import EditVaultModal from '../../components/owner/EditVaultModal'
import EditAssetModal from '../../components/owner/EditAssetModal'
import Pagination from '../../components/owner/Pagination'
import StatCards from '../../components/owner/StatCards'
import VaultBanner from '../../components/owner/VaultBanner'
import { useAdminResource } from '../../hooks/useAdminResource'
import { useOwnerCatalog } from '../../hooks/useOwnerCatalog'
import { useVaultExecutor } from '../../hooks/useVaultExecutor'
import { buildStats, filterAssets, getTypeTabs, paginate } from '../../utils/catalog'
import { isOwnerLockedByHandover, isVaultLockedByHandover } from '../../utils/handover'

const DEFAULT_PAGE_SIZE = 4

// Trang "Danh mục tài sản số": banner kho, thống kê và danh sách tài sản có tìm kiếm, lọc, phân trang
export default function AssetCatalogPage() {
  const catalog = useOwnerCatalog()
  const navigate = useNavigate()
  const { status, error, vaults, assets, beneficiaries, handovers, assetsLoading, selectedVault, selectVault, reload } = catalog
  const executor = useVaultExecutor(selectedVault?.vaultId ?? null)
  const subscription = useAdminResource(getMySubscription)

  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [modal, setModal] = useState(null)
  const [editingAsset, setEditingAsset] = useState(null)
  const [toast, setToast] = useState(null)
  const closeToast = useCallback(() => setToast(null), [])

  const stats = useMemo(() => buildStats(assets, beneficiaries), [assets, beneficiaries])
  const tabs = useMemo(() => getTypeTabs(assets), [assets])
  const filtered = useMemo(() => filterAssets(assets, { query, type }), [assets, query, type])
  const pageData = paginate(filtered, page, pageSize)

  const closeModal = () => setModal(null)

  // Người dùng mới (chưa có kho nào) và chưa có gói đang hiệu lực thì phải chọn gói trước khi tạo kho đầu tiên.
  // Không kiểm tra được gói (lỗi mạng hoặc máy chủ) thì không chặn, để BE quyết định khi tạo kho.
  const needsPlanFirst = vaults.length === 0 && subscription.data?.hasActiveSubscription === false
  const openCreateVault = () => setModal(needsPlanFirst ? 'plan' : 'vault')

  const handleQueryChange = (value) => {
    setQuery(value)
    setPage(1)
  }

  const handleTypeChange = (value) => {
    setType(value)
    setPage(1)
  }

  const handlePageSizeChange = (value) => {
    setPageSize(value)
    setPage(1)
  }

  const handleVaultCreated = (vault) => {
    closeModal()
    selectVault(vault.vaultId)
    reload()
  }

  const handleAssetCreated = (_asset, { executorError } = {}) => {
    closeModal()
    if (executorError) setToast({ title: 'Đã tạo tài sản nhưng chưa gán được người thi hành', detail: executorError })
    reload()
    executor.reload()
  }

  const handleVaultUpdated = () => {
    closeModal()
    setToast({ title: 'Đã cập nhật thông tin kho' })
    reload()
  }

  const handleVaultClosed = () => {
    closeModal()
    setToast({ title: 'Đã đóng kho' })
    reload()
  }

  const finishEdit = (title) => {
    setEditingAsset(null)
    setToast({ title })
    reload()
  }

  if (status === 'loading') {
    return (
      <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500">
        <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
        Đang tải danh mục tài sản...
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

  const createVaultModal = (
    <>
      <CreateVaultModal open={modal === 'vault'} onClose={closeModal} onCreated={handleVaultCreated} />
      {modal === 'plan' && <ChoosePlanModal onClose={closeModal} onContinueFree={() => setModal('vault')} />}
    </>
  )

  if (!selectedVault) {
    return (
      <>
        <section className="av-panel av-empty">
          <p className="mb-3">Bạn chưa có kho lưu trữ nào.</p>
          <Button type="button" variant="primary" className="av-btn av-btn-sm" onClick={openCreateVault}>
            Tạo kho đầu tiên
          </Button>
        </section>
        {createVaultModal}
      </>
    )
  }

  const lockedByHandover = isVaultLockedByHandover(handovers, selectedVault.vaultId)
  const ownerLockedByHandover = isOwnerLockedByHandover(handovers)

  return (
    <div className="d-flex flex-column gap-4">
      <VaultBanner
        vault={selectedVault}
        vaults={vaults}
        onSelectVault={selectVault}
        onAddAsset={() => setModal('asset')}
        onCreateVault={openCreateVault}
        onEditVault={() => setModal('editVault')}
        onCloseVault={() => setModal('closeVault')}
        onCheckIn={() => navigate('/owner/proof-of-life?ping=1')}
        lockedByHandover={lockedByHandover}
        ownerLockedByHandover={ownerLockedByHandover}
      />
      <StatCards stats={stats} executor={executor} />

      <section className="av-panel d-flex flex-column gap-3" aria-labelledby="catalog-title">
        <div>
          <h2 id="catalog-title" className="mb-1 fw-bold text-ink" style={{ fontSize: 17 }}>
            Danh Mục Tài Sản Số Trong Kho
          </h2>
          <p className="mb-0 fs-12 text-slate-500 d-flex align-items-center gap-2">
            <Lock size={12} aria-hidden="true" />
            Giấy tờ được mã hóa AES-256-GCM trước khi lưu trữ
          </p>
        </div>

        {assetsLoading ? (
          <p role="status" className="d-flex align-items-center gap-3 fs-14 text-slate-500 mb-0">
            <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
            Đang tải tài sản của kho...
          </p>
        ) : assets.length === 0 ? (
          <div className="av-empty">
            <p className="mb-3">Kho này chưa có tài sản nào.</p>
            <Button
              type="button"
              variant="primary"
              className="av-btn av-btn-sm"
              disabled={lockedByHandover || ownerLockedByHandover || selectedVault.status !== 'Active'}
              onClick={() => setModal('asset')}
            >
              Thêm tài sản đầu tiên
            </Button>
          </div>
        ) : (
          <>
            <AssetFilters
              query={query}
              onQueryChange={handleQueryChange}
              tabs={tabs}
              activeType={type}
              onTypeChange={handleTypeChange}
            />
            {filtered.length === 0 ? (
              <p className="av-empty mb-0">Không tìm thấy tài sản phù hợp.</p>
            ) : (
              <div>
                {pageData.items.map((asset) => (
                  <AssetCard key={asset.assetId} asset={asset} onEdit={setEditingAsset} />
                ))}
              </div>
            )}
            <Pagination
              pageData={pageData}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </section>

      {modal === 'closeVault' && <CloseVaultModal vault={selectedVault} onClose={closeModal} onClosed={handleVaultClosed} />}
      {modal === 'editVault' && <EditVaultModal vault={selectedVault} onClose={closeModal} onSaved={handleVaultUpdated} />}
      <AddAssetModal open={modal === 'asset'} vault={selectedVault} currentExecutorId={executor.data?.executorId ?? null} onClose={closeModal} onCreated={handleAssetCreated} />
      {editingAsset && (
        <EditAssetModal
          asset={editingAsset}
          impact={{ documents: editingAsset.documents.length, beneficiaries: editingAsset.beneficiaries.length }}
          onClose={() => setEditingAsset(null)}
          onSaved={() => finishEdit('Đã cập nhật tài sản')}
          onRevoked={() => finishEdit('Đã thu hồi tài sản')}
        />
      )}
      {createVaultModal}
      <AppToast show={Boolean(toast)} onClose={closeToast} title={toast?.title} detail={toast?.detail} />
    </div>
  )
}
