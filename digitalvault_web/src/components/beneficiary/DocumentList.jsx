import { BadgeCheck, Download, FileText, Lock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Alert } from 'react-bootstrap'
import { downloadBlob } from '../../utils/download'
import { fileTypeLabel } from '../../utils/catalog'
import { documentSubmittedLabel } from '../../utils/handover'

// Danh sách giấy tờ (DocumentDto) có nút tải về; download(document) gọi API trả { blob, signatureValid }
export default function DocumentList({ documents, download, onDownloaded, emptyMessage = 'Chưa có giấy tờ nào.', label = 'Giấy tờ' }) {
  const [downloadingId, setDownloadingId] = useState(null)
  const [error, setError] = useState('')

  const handleDownload = async (document) => {
    setDownloadingId(document.documentId)
    setError('')
    try {
      const { blob, signatureValid } = await download(document)
      downloadBlob(document.fileName || `tai-lieu-${document.documentId}`, blob)
      onDownloaded?.(document, signatureValid)
    } catch (caught) {
      const reason = caught?.status === 404 ? 'Không tìm thấy giấy tờ.' : caught?.status === 403 ? 'Bạn không có quyền tải giấy tờ này.' : caught?.message
      setError(`Không tải được ${document.fileName ?? 'giấy tờ'}. ${reason ?? ''}`.trim())
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="d-flex flex-column gap-2">
      {error && <Alert variant="danger" className="av-alert mb-0">{error}</Alert>}
      {documents.length === 0 ? (
        <p className="av-empty mb-0">{emptyMessage}</p>
      ) : (
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2" aria-label={label}>
          {documents.map((document) => (
            <li key={document.documentId} className="av-doc-item">
              <span className="av-stat-icon is-brand">
                <FileText size={16} aria-hidden="true" />
              </span>
              <div className="av-doc-main">
                <p className="mb-0 fs-13 fw-semibold text-ink text-truncate">{document.fileName || `Tài liệu #${document.documentId}`}</p>
                <p className="mb-0 fs-11 text-slate-500 font-mono">{fileTypeLabel(document.fileType)}</p>
                {documentSubmittedLabel(document) && <p className="mb-0 fs-11 text-slate-500">{documentSubmittedLabel(document)}</p>}
              </div>
              {document.isEncrypted && (
                <span className="av-badge av-badge-ok">
                  <Lock size={10} aria-hidden="true" />
                  Đã mã hóa
                </span>
              )}
              {document.signatureValid === true && (
                <span className="av-badge av-badge-info">
                  <BadgeCheck size={10} aria-hidden="true" />
                  Chữ ký hợp lệ
                </span>
              )}
              {document.signatureValid === false && (
                <span className="av-badge av-badge-warn">
                  <ShieldAlert size={10} aria-hidden="true" />
                  Chữ ký không hợp lệ
                </span>
              )}
              <button
                type="button"
                className="av-ghost-btn"
                id={`download-document-${document.documentId}`}
                disabled={downloadingId !== null}
                onClick={() => handleDownload(document)}
              >
                <Download size={14} aria-hidden="true" />
                {downloadingId === document.documentId ? 'Đang tải...' : 'Tải về'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
