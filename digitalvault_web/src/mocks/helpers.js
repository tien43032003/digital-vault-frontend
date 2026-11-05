import { delay, HttpResponse } from 'msw'
import { getDb, getMockLatency, getSessionUserId, isMockHybrid } from './db'

// Trả lỗi đúng định dạng của BE: { status, detail }
export function problem(status, detail, code) {
  return HttpResponse.json(code ? { status, detail, code, errorCode: code } : { status, detail }, { status })
}

// Giống middleware BE: body có trường ngoài hợp đồng thì trả 400
export function hasUnknownFields(body, allowed) {
  return Object.keys(body ?? {}).some((key) => !allowed.includes(key))
}

export const isBlank = (value) => typeof value !== 'string' || value.trim() === ''

// Bọc handler: độ trễ giả, kiểm tra header chống CSRF cho request thay đổi dữ liệu, kiểm tra phiên
export function route(handler, { auth = true, role = null } = {}) {
  return async (info) => {
    await delay(getMockLatency())
    const { request } = info
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('X-Vault-Request') !== '1') {
      return problem(400, 'Set X-Vault-Request: 1 on mutation requests.')
    }
    let userId = null
    if (auth) {
      userId = getSessionUserId()
      if (userId === null) return problem(401, 'Authentication required.')
      // BE kiểm tra role ở tầng service: đã đăng nhập nhưng sai role thì trả 403
      const account = getDb().users.find((u) => u.userId === userId)
      if (role && !isMockHybrid() && !account?.roles.includes(role)) return problem(403, `Role ${role} required.`)
    }
    let body = null
    // Request multipart (upload) do handler tự đọc formData, không đọc trước ở đây để không làm cạn body
    const isMultipart = (request.headers.get('content-type') ?? '').startsWith('multipart/')
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && !isMultipart) {
      try {
        body = await request.json()
      } catch {
        body = null
      }
    }
    return handler({ ...info, userId, body })
  }
}

// Endpoint của Owner: BE yêu cầu role Owner, sai role trả 403
export const ownerRoute = (handler) => route(handler, { role: 'Owner' })

// Endpoint của Executor: BE yêu cầu role Executor, sai role trả 403
export const executorRoute = (handler) => route(handler, { role: 'Executor' })

// Endpoint của System Admin: BE yêu cầu role Admin, sai role trả 403
export const adminRoute = (handler) => route(handler, { role: 'Admin' })
