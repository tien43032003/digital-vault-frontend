import { useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router-dom'
import { startHandover } from '../../callapi/executorApi'
import { assetNamesOf, handoverOwnerName, vaultLabel } from '../../utils/executor'
import { executorNextAction, handoverActionErrorMessage, handoverCode } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'
import HandoverStatusBadge from './HandoverStatusBadge'

// Bảng hồ sơ bàn giao của Executor; mỗi dòng có nút bước tiếp theo theo trạng thái (bắt đầu bàn giao, bổ sung và gửi lại, hoàn tất...).
// vaultNames (vaultId -> tên kho) là tuỳ chọn
export default function HandoverTable({ handovers, vaultNames = new Map() }) {
  const navigate = useNavigate()
  const [startingId, setStartingId] = useState(null)
  const [actionError, setActionError] = useState('')

  // Hồ sơ đã được duyệt: bắt đầu bàn giao rồi vào chi tiết để nộp biên bản và hoàn tất
  const handleStart = async (requestId) => {
    setStartingId(requestId)
    setActionError('')
    try {
      await startHandover(requestId)
      navigate(`/executor/handovers/${requestId}`)
    } catch (caught) {
      setActionError(handoverActionErrorMessage(caught, 'start'))
      setStartingId(null)
    }
  }

  return (
    <div className="d-flex flex-column gap-3">
      {actionError && <Alert variant="danger" className="av-alert mb-0">{actionError}</Alert>}
      <div className="table-responsive">
      <table className="table align-middle mb-0 fs-13" aria-label="Danh sách hồ sơ bàn giao">
        <thead>
          <tr className="fs-11 text-slate-500">
            <th scope="col">Mã hồ sơ</th>
            <th scope="col">Kho</th>
            <th scope="col">Ngày tạo</th>
            <th scope="col">Phạm vi</th>
            <th scope="col">Giấy tờ</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">
              <span className="visually-hidden">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {handovers.map((item) => (
            <tr key={item.requestId}>
              <td>
                <Link to={`/executor/handovers/${item.requestId}`} className="fw-semibold text-decoration-none">
                  {handoverCode(item)}
                </Link>
              </td>
              <td>
                <span className="d-block">{vaultLabel(item.vaultId, vaultNames.get(item.vaultId))}</span>
                {handoverOwnerName(item) && <span className="d-block fs-12 text-slate-500">{`Chủ kho: ${handoverOwnerName(item)}`}</span>}
              </td>
              <td className="text-nowrap">{formatDateTime(item.initiatedAt)}</td>
              <td>
                <span className="d-block">{`${new Set(item.cases.map((entry) => entry.assetId)).size} tài sản`}</span>
                {assetNamesOf(item.cases).length > 0 && <span className="d-block fs-12 text-slate-500">{assetNamesOf(item.cases).join(', ')}</span>}
              </td>
              <td>{`${item.documents.length} giấy tờ`}</td>
              <td>
                <HandoverStatusBadge status={item.status} />
                {(item.status === 'Rejected' || item.status === 'Additional_Info') && item.legalComment && (
                  <div className="mt-1 fs-12 text-danger" style={{ maxWidth: 260 }}>
                    <strong>Lý do pháp lý:</strong> {item.legalComment}
                  </div>
                )}
              </td>
              <td className="text-end text-nowrap">
                {(() => {
                  const next = executorNextAction(item.status)
                  if (next.kind === 'start') {
                    return (
                      <Button type="button" variant="primary" className="av-btn av-btn-sm" disabled={startingId !== null} onClick={() => handleStart(item.requestId)}>
                        {startingId === item.requestId ? 'Đang xử lý...' : next.label}
                      </Button>
                    )
                  }
                  return (
                    <Link to={`/executor/handovers/${item.requestId}`} className={`av-ghost-btn${next.primary ? ' is-brand' : ''}`}>
                      {next.label}
                    </Link>
                  )
                })()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
