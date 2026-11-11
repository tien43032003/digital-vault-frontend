import { ExternalLink, FileCheck2, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Alert, Button, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { getLegalHandovers, getLegalHandoversByStatuses } from '../../callapi/legalApi'
import AdminPager from '../../components/admin/AdminPager'
import HandoverStatusBadge from '../../components/executor/HandoverStatusBadge'
import { useAdminList } from '../../hooks/useAdminList'
import { vaultLabel } from '../../utils/executor'
import { handoverCode } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'

export default function LegalHandoverListPage({
  title = 'Hồ sơ chờ thẩm định',
  description = 'Xem và thẩm định tính pháp lý của các hồ sơ bàn giao do Người thi hành nộp.',
  status = 'Pending_Legal',
  statuses = null,
  emptyMessage = 'Không có hồ sơ nào trong danh mục này.',
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // statuses: gộp hồ sơ của nhiều trạng thái (vd tab "Đã duyệt" gồm cả hồ sơ đã chuyển sang đang bàn giao / hoàn tất)
  const statusKey = statuses ? statuses.join(',') : ''
  const params = useMemo(() => (statusKey ? { page, pageSize, statuses: statusKey.split(',') } : { page, pageSize, status }), [page, pageSize, status, statusKey])
  const { items: handovers, error, loading, reload } = useAdminList(statusKey ? getLegalHandoversByStatuses : getLegalHandovers, params)

  return (
    <div className="d-flex flex-column gap-4">
      {/* Banner đầu trang */}
      <section className="av-panel av-banner">
        <div className="d-flex align-items-center gap-3">
          <span className="av-icon-tile">
            <FileCheck2 size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="mb-1 fw-bold text-ink" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            <p className="mb-0 fs-12 text-slate-500">{description}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="light"
          className="av-btn av-btn-sm border d-flex align-items-center gap-2"
          onClick={reload}
          disabled={loading}
          title="Tải lại danh sách"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} aria-hidden="true" />
          <span>Làm mới</span>
        </Button>
      </section>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <Alert variant="danger" className="av-alert d-flex align-items-center justify-content-between mb-0">
          <span>{error}</span>
          <Button type="button" variant="light" size="sm" className="border fs-12" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      )}

      {/* Bảng danh sách hồ sơ */}
      <section className="av-panel d-flex flex-column gap-3 p-0 overflow-hidden" aria-label={title}>
        {loading && handovers.length === 0 ? (
          <div className="p-4 text-center">
            <p role="status" className="d-inline-flex align-items-center gap-3 mb-0 fs-13 text-slate-500">
              <span className="spinner-border spinner-border-sm text-brand" aria-hidden="true" />
              Đang tải danh sách hồ sơ thẩm định...
            </p>
          </div>
        ) : handovers.length === 0 ? (
          <div className="p-5 text-center">
            <p className="mb-0 fs-13 text-slate-500">{emptyMessage}</p>
          </div>
        ) : (
          <div className="table-responsive">
            <Table hover className="align-middle mb-0 fs-13">
              <thead className="bg-light">
                <tr className="fs-11 text-slate-500 text-uppercase border-bottom">
                  <th scope="col" className="ps-4 py-3">
                    Mã hồ sơ
                  </th>
                  <th scope="col" className="py-3">
                    Kho di sản
                  </th>
                  <th scope="col" className="py-3">
                    Trạng thái
                  </th>
                  <th scope="col" className="py-3">
                    Ngày tạo
                  </th>
                  <th scope="col" className="text-end pe-4 py-3">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {handovers.map((handover) => (
                  <tr key={handover.requestId}>
                    <td className="ps-4 py-3">
                      <span className="fw-semibold text-ink">{handoverCode(handover)}</span>
                    </td>
                    <td className="py-3">
                      <span className="d-block text-slate-600">{vaultLabel(handover.vaultId, handover.vaultName)}</span>
                      {handover.ownerName && <span className="d-block fs-12 text-slate-500">{`Chủ kho: ${handover.ownerName}`}</span>}
                    </td>
                    <td className="py-3">
                      <HandoverStatusBadge status={handover.status} />
                    </td>
                    <td className="py-3 text-slate-500">
                      {formatDateTime(handover.initiatedAt)}
                    </td>
                    <td className="text-end pe-4 py-3">
                      <Link
                        to={`/verifier/handovers/${handover.requestId}`}
                        className="av-btn av-btn-sm border text-decoration-none d-inline-flex align-items-center gap-1"
                        style={{ height: 32, padding: '0 12px' }}
                      >
                        <span>Xem</span>
                        <ExternalLink size={13} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}

        {/* Phân trang */}
        <div className="px-3 pb-2 pt-1 border-top">
          <AdminPager
            page={page}
            pageSize={pageSize}
            count={handovers.length}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setPage(1)
            }}
          />
        </div>
      </section>
    </div>
  )
}
