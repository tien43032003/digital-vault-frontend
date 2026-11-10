import { Link } from 'react-router-dom'
import { assetNamesOf, handoverOwnerName, vaultLabel } from '../../utils/executor'
import { handoverCode } from '../../utils/handover'
import { formatDateTime } from '../../utils/proofOfLife'
import HandoverStatusBadge from './HandoverStatusBadge'

// Bảng hồ sơ bàn giao của Executor; mỗi dòng dẫn tới trang chi tiết. vaultNames (vaultId -> tên kho) là tuỳ chọn
export default function HandoverTable({ handovers, vaultNames = new Map() }) {
  return (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
