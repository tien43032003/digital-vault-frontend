import { http, HttpResponse } from 'msw'
import { getDb, nextId, saveDb } from './db'
import { isBlank, problem } from './helpers'

function readPaging(url) {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return { page: 1, pageSize: 20 }
  }
  return { page, pageSize }
}

const handoverDto = (h) => ({
  requestId: h.requestId,
  vaultId: h.vaultId,
  requestType: h.requestType || 'Standard',
  status: h.status,
  initiatedAt: h.initiatedAt || new Date().toISOString(),
  documents: (h.documents || []).map((d) => ({
    documentId: d.documentId,
    fileName: d.fileName,
    fileType: d.fileType || 'application/pdf',
    isEncrypted: d.isEncrypted ?? true,
    signatureValid: d.signatureValid ?? true,
  })),
  assetDocuments: (h.assetDocuments || []).map((d) => ({
    documentId: d.documentId,
    fileName: d.fileName,
    fileType: d.fileType || 'application/pdf',
    isEncrypted: d.isEncrypted ?? true,
  })),
  cases: (h.cases || []).map((c) => ({
    handoverId: c.handoverId,
    assetId: c.assetId,
    beneficiaryId: c.beneficiaryId,
    status: c.status,
  })),
})

// Duyệt/Từ chối của BE là multipart/form-data: File, Signature (bắt buộc) và Comment
async function readDecision(request) {
  try {
    const form = await request.formData()
    const isFile = (value) => value !== null && typeof value === 'object' && typeof value.size === 'number'
    return { comment: String(form.get('Comment') ?? '').trim(), hasFile: isFile(form.get('File')), hasSignature: isFile(form.get('Signature')) }
  } catch {
    return null
  }
}

export const legalHandlers = [
  // Danh sách hồ sơ thẩm định pháp lý
  http.get('*/api/legal/handovers', ({ request }) => {
    const url = new URL(request.url)
    const { page, pageSize } = readPaging(url)
    const status = url.searchParams.get('status')
    const db = getDb()

    let items = db.handovers || []
    if (status) {
      items = items.filter((h) => h.status === status)
    }

    const start = (page - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize).map(handoverDto)

    return HttpResponse.json({
      page,
      pageSize,
      items: pageItems,
    })
  }),

  // Chi tiết một hồ sơ thẩm định
  http.get('*/api/legal/handovers/:requestId', ({ params }) => {
    const requestId = Number(params.requestId)
    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ bàn giao.')

    return HttpResponse.json(handoverDto(handover))
  }),

  // Tải giấy tờ chứng từ / bằng chứng hồ sơ
  http.get('*/api/legal/handovers/:requestId/documents/:documentId/content', ({ params }) => {
    const requestId = Number(params.requestId)
    const documentId = Number(params.documentId)
    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ.')
    const doc = (handover.documents || []).find((d) => d.documentId === documentId)
    if (!doc) return problem(404, 'Không tìm thấy giấy tờ.')

    return new HttpResponse(new Blob(['mock document content']), {
      headers: {
        'Content-Type': 'application/pdf',
        'X-Signature-Valid': 'true',
      },
    })
  }),

  // Tải tài liệu tài sản
  http.get('*/api/legal/handovers/:requestId/asset-documents/:documentId/content', ({ params }) => {
    const requestId = Number(params.requestId)
    const documentId = Number(params.documentId)
    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ.')
    const doc = (handover.assetDocuments || []).find((d) => d.documentId === documentId)
    if (!doc && (handover.assetDocuments || []).length > 0) return problem(404, 'Không tìm thấy tài liệu tài sản.')

    return new HttpResponse(new Blob(['mock asset document content']), {
      headers: {
        'Content-Type': 'application/pdf',
      },
    })
  }),

  // Duyệt hồ sơ pháp lý
  http.post('*/api/legal/handovers/:requestId/approve', async ({ request, params }) => {
    const requestId = Number(params.requestId)
    const decision = await readDecision(request)
    if (!decision) return problem(400, 'Request must be multipart/form-data.')
    if (!decision.hasFile || !decision.hasSignature) return problem(400, 'File and Signature are required.')
    const comment = decision.comment

    if (!comment || isBlank(comment)) {
      return problem(400, 'Ý kiến thẩm định không được để trống.')
    }
    if (comment.length > 2000) {
      return problem(400, 'Ý kiến thẩm định không được vượt quá 2000 ký tự.')
    }

    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ.')

    if (handover.status !== 'Pending_Legal') {
      return problem(409, 'Chỉ có thể thẩm định khi hồ sơ ở trạng thái Chờ thẩm định pháp lý (Pending_Legal).')
    }

    handover.status = 'Approved'
    saveDb(db)

    return HttpResponse.json({
      verificationId: nextId('verification'),
      requestId,
      verifierId: 1,
      status: 'Approved',
      comment,
      submittedAt: handover.initiatedAt || new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
    })
  }),

  // Từ chối hồ sơ pháp lý
  http.post('*/api/legal/handovers/:requestId/reject', async ({ request, params }) => {
    const requestId = Number(params.requestId)
    const decision = await readDecision(request)
    if (!decision) return problem(400, 'Request must be multipart/form-data.')
    if (!decision.hasFile || !decision.hasSignature) return problem(400, 'File and Signature are required.')
    const comment = decision.comment

    if (!comment || isBlank(comment)) {
      return problem(400, 'Lý do từ chối không được để trống.')
    }
    if (comment.length > 2000) {
      return problem(400, 'Lý do từ chối không được vượt quá 2000 ký tự.')
    }

    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ.')

    if (handover.status !== 'Pending_Legal') {
      return problem(409, 'Chỉ có thể thẩm định khi hồ sơ ở trạng thái Chờ thẩm định pháp lý (Pending_Legal).')
    }

    handover.status = 'Rejected'
    saveDb(db)

    return HttpResponse.json({
      verificationId: nextId('verification'),
      requestId,
      verifierId: 1,
      status: 'Rejected',
      comment,
      submittedAt: handover.initiatedAt || new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
    })
  }),

  // Yêu cầu bổ sung thông tin
  http.post('*/api/legal/handovers/:requestId/request-additional-information', async ({ request, params }) => {
    const requestId = Number(params.requestId)
    const body = await request.json().catch(() => ({}))
    const comment = body?.comment?.trim()

    if (!comment || isBlank(comment)) {
      return problem(400, 'Yêu cầu bổ sung không được để trống.')
    }
    if (comment.length > 2000) {
      return problem(400, 'Yêu cầu bổ sung không được vượt quá 2000 ký tự.')
    }

    const db = getDb()
    const handover = (db.handovers || []).find((h) => h.requestId === requestId)
    if (!handover) return problem(404, 'Không tìm thấy hồ sơ.')

    if (handover.status !== 'Pending_Legal') {
      return problem(409, 'Chỉ có thể thẩm định khi hồ sơ ở trạng thái Chờ thẩm định pháp lý (Pending_Legal).')
    }

    handover.status = 'Additional_Info'
    saveDb(db)

    return HttpResponse.json({
      verificationId: nextId('verification'),
      requestId,
      verifierId: 1,
      status: 'Additional_Info',
      comment,
      submittedAt: handover.initiatedAt || new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
    })
  }),
]
