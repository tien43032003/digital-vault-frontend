import { http, HttpResponse } from 'msw'
import { getDb, nextId, saveDb } from './db'
import { adminRoute, hasUnknownFields, isBlank, problem } from './helpers'

// Mock cổng System Admin, bám AdminController/AdminService của BE
const VALID_ROLES = ['Admin', 'Owner', 'Executor', 'Beneficiary', 'LegalVerifier']
const VALID_STATUSES = ['Active', 'Disabled', 'Locked']
// Tài khoản seed không lưu ngày tạo nên dùng mốc cố định
const SEED_CREATED_AT = '2026-01-01T00:00:00.000Z'

// ManagementService.Paging của BE: page >= 1, pageSize trong 1..100
function readPaging(url) {
  const page = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null
  return { page, pageSize }
}

const userDto = (user) => ({
  userId: user.userId,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone ?? null,
  identityNumber: user.identityNumber ?? null,
  status: user.status ?? 'Active',
  roles: user.roles,
  createdAt: user.createdAt ?? SEED_CREATED_AT,
  updatedAt: user.updatedAt ?? user.createdAt ?? SEED_CREATED_AT,
})

// Ghi vào nhật ký kiểm toán như BE (AuditLog) mỗi khi Admin thay đổi dữ liệu
function audit(adminUserId, action, entityId, entityType = 'User') {
  const db = getDb()
  db.activityLogs.push({
    logId: nextId('log'),
    userId: adminUserId,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    result: 'Success',
  })
}

// Vai trò không có trong hệ thống bị BE bỏ qua; trùng lặp được gộp
const cleanRoles = (roles) => [...new Set(roles)].filter((role) => VALID_ROLES.includes(role))


// ---- Ma trận phân quyền (AdminService.GetRolesAsync) ----
const ROLE_MATRIX = [
  { roleId: 1, roleName: 'Owner', description: 'Chủ sở hữu kho di sản số', permissions: ['vault:create', 'vault:manage', 'asset:create', 'asset:manage', 'executor:assign', 'beneficiary:assign', 'proof_of_life:ping', 'audit:view_own'] },
  { roleId: 2, roleName: 'Executor', description: 'Người thi hành / Người bàn giao', permissions: ['handover:view_assigned', 'handover:accept', 'handover:decline', 'handover:submit_proof', 'handover:start', 'handover:complete'] },
  { roleId: 3, roleName: 'LegalVerifier', description: 'Thẩm định viên pháp lý', permissions: ['legal:view_queue', 'legal:review_evidence', 'legal:approve', 'legal:reject', 'legal:request_info', 'legal:sign'] },
  { roleId: 4, roleName: 'Beneficiary', description: 'Người thụ hưởng di sản', permissions: ['claim:view_cases', 'claim:download_asset', 'claim:decrypt', 'claim:confirm_receipt'] },
  { roleId: 5, roleName: 'Admin', description: 'Quản trị viên hệ thống', permissions: ['admin:users_manage', 'admin:roles_view', 'admin:audit_logs', 'admin:security_alerts', 'admin:system_config', 'admin:key_rotation', 'admin:integrations_manage'] },
]

// ---- Tham số hệ thống (BE giữ trong bộ nhớ, bắt đầu bằng giá trị mặc định) ----
const CONFIG_GROUPS = ['encryptionPolicy', 'proofOfLifePolicy', 'storagePolicy', 'backupPolicy']

function defaultConfig() {
  return {
    encryptionPolicy: { defaultAlgorithm: 'AES-256-GCM', keyRotationIntervalDays: 90, minPasswordLength: 12, require2FAForAdmin: true },
    proofOfLifePolicy: { defaultPingIntervalDays: 30, gracePeriodDays: 7, warningDaysBeforeGrace: 3 },
    storagePolicy: { maxUploadSizeBytes: 10485760, allowedExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.docx'] },
    backupPolicy: { autoBackupEnabled: true, cronSchedule: '0 0 * * *', retentionDays: 30 },
    lastUpdatedAt: '2026-10-26T10:30:00.000Z',
    updatedByAdminEmail: 'admin@legacyvault.local',
  }
}

const readConfig = () => {
  const db = getDb()
  db.systemConfig ??= defaultConfig()
  return db.systemConfig
}

// ---- Khóa mã hóa: mỗi tài sản một khóa, tạo lần đầu khi được hỏi tới ----
const SEED_KEY_CREATED_AT = '2026-06-01T00:00:00.000Z'

function readKeys() {
  const db = getDb()
  db.encryptionKeys ??= db.assets.map((asset, index) => ({
    keyId: index + 1,
    assetId: asset.assetId,
    algorithm: 'AES-256-GCM',
    keyVersion: 1,
    status: 'Active',
    createdAt: SEED_KEY_CREATED_AT,
    rotatedAt: null,
  }))
  return db.encryptionKeys
}

function keySummary() {
  const db = getDb()
  const intervalDays = readConfig().encryptionPolicy.keyRotationIntervalDays
  const cutoff = Date.now() - intervalDays * 86400000
  const keys = readKeys().map((key) => ({
    ...key,
    assetName: db.assets.find((asset) => asset.assetId === key.assetId)?.name ?? null,
    needsRotation: key.status === 'Active' && new Date(key.rotatedAt ?? key.createdAt).getTime() < cutoff,
  }))
  const rotated = keys.filter((key) => key.rotatedAt).map((key) => key.rotatedAt).sort()
  return {
    totalKeys: keys.length,
    activeKeys: keys.filter((key) => key.status === 'Active').length,
    rotatedKeys: rotated.length,
    keysNeedingRotation: keys.filter((key) => key.needsRotation).length,
    rotationIntervalDays: intervalDays,
    lastRotatedAt: rotated.at(-1) ?? null,
    keys,
  }
}

// ---- Dịch vụ tích hợp bên thứ ba (danh mục cố định như BE) ----
const INTEGRATIONS = {
  'ekyc-vnpt': { name: 'Hệ thống eKYC Định danh điện tử', type: 'eKYC', provider: 'VNPT AI', endpoint: 'https://api.vnpt.vn/ekyc/v1' },
  'ca-vnpt': { name: 'Dịch vụ Chữ ký số Chứng thư CA', type: 'DigitalSignature', provider: 'VNPT-CA', endpoint: 'https://ca.vnpt.vn/api/sign' },
  'notary-gateway': { name: 'Cổng Công chứng điện tử Pháp lý', type: 'ElectronicNotary', provider: 'VN Notary Gateway', endpoint: 'https://notary.gov.vn/api/v2' },
  'blob-storage': { name: 'Lưu trữ tài liệu mã hóa Blob Storage', type: 'CloudStorage', provider: 'Azure Blob Storage', endpoint: 'https://legacyvault.blob.core.windows.net' },
  'smtp-gateway': { name: 'Cổng phát hành OTP & Email thông báo', type: 'EmailGateway', provider: 'SMTP Relay Service', endpoint: 'smtp://mail.legacyvault.local:587' },
}

// ---- Cảnh báo an ninh: quy tắc như AdminService.GetSecurityDashboardAsync (24 giờ qua, tối đa 500 bản ghi) ----
function securityDashboard() {
  const db = getDb()
  const since = Date.now() - 24 * 3600000
  const recent = db.activityLogs
    .filter((log) => new Date(log.timestamp).getTime() >= since)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 500)
  const failed = recent.filter((log) => String(log.result).toLowerCase() !== 'success')
  const failureRate = recent.length > 0 ? Math.round((failed.length * 10000) / recent.length) / 100 : 0

  const countBy = (rows, keyOf) => {
    const groups = new Map()
    rows.forEach((row) => {
      const key = keyOf(row)
      if (key !== null && key !== undefined && key !== '') groups.set(key, [...(groups.get(key) ?? []), row])
    })
    return groups
  }

  const topFailedActions = [...countBy(failed, (log) => log.action)]
    .map(([key, rows]) => ({ key, value: rows.length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const alerts = []
  const newest = (rows) => rows.map((row) => row.timestamp).sort().at(-1)
  if (failed.length >= 5) {
    alerts.push({
      alertId: 'ALERT-SPIKE-FAIL',
      severity: 'Warning',
      title: 'Tỷ lệ thao tác thất bại tăng bất thường',
      description: `Ghi nhận ${failed.length} thao tác thất bại trong 24 giờ qua (chiếm ${failureRate}% tổng số thao tác).`,
      targetUserEmail: null,
      ipAddress: null,
      detectedAt: new Date().toISOString(),
      status: 'Active',
    })
  }
  countBy(failed, (log) => log.userId).forEach((rows, userId) => {
    if (rows.length < 3) return
    const email = db.users.find((user) => user.userId === userId)?.email ?? null
    alerts.push({
      alertId: `ALERT-FAIL-USER-${userId}`,
      severity: 'Critical',
      title: 'Phát hiện người dùng có nhiều thao tác lỗi liên tiếp',
      description: `Người dùng ID ${userId} (${email ?? 'N/A'}) có ${rows.length} lần thao tác không thành công.`,
      targetUserEmail: email,
      ipAddress: rows[0].ipAddress ?? null,
      detectedAt: newest(rows),
      status: 'Active',
    })
  })
  countBy(failed, (log) => log.ipAddress).forEach((rows, ip) => {
    if (rows.length < 5) return
    const hash = [...ip].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1000003, 7)
    alerts.push({
      alertId: `ALERT-IP-BRUTE-${hash}`,
      severity: 'Critical',
      title: 'Cảnh báo dấu hiệu Brute-force từ IP',
      description: `Địa chỉ IP ${ip} ghi nhận ${rows.length} yêu cầu lỗi liên tiếp.`,
      targetUserEmail: null,
      ipAddress: ip,
      detectedAt: newest(rows),
      status: 'Active',
    })
  })
  if (alerts.length === 0 && recent.length > 0) {
    alerts.push({
      alertId: 'INFO-NORMAL',
      severity: 'Info',
      title: 'Hệ thống an toàn',
      description: 'Không phát hiện hành vi truy cập hoặc thao tác bất thường trong 24 giờ qua.',
      targetUserEmail: null,
      ipAddress: null,
      detectedAt: new Date().toISOString(),
      status: 'Active',
    })
  }
  return {
    totalAuditLogs24h: recent.length,
    failedActions24h: failed.length,
    activeAlertsCount: alerts.filter((alert) => alert.severity !== 'Info').length,
    failureRatePercentage: failureRate,
    recentAlerts: alerts,
    topFailedActions,
  }
}

const adminEmail = (userId) => getDb().users.find((user) => user.userId === userId)?.email ?? ''

const extraAdminHandlers = [
  http.put(
    '*/api/admin/users/:userId',
    adminRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['fullName', 'phone', 'identityNumber'])) return problem(400, 'Unknown fields.')
      const { fullName, phone, identityNumber } = body ?? {}
      if ((fullName != null && fullName.length > 100) || (phone != null && phone.length > 20) || (identityNumber != null && identityNumber.length > 20)) {
        return problem(400, 'A field is too long.')
      }
      const target = getDb().users.find((user) => user.userId === Number(params.userId))
      if (!target) return problem(404, 'Không tìm thấy người dùng.')
      // Như BE: họ tên rỗng thì giữ nguyên, điện thoại/CCCD rỗng thì xóa, bỏ trống (null) thì giữ nguyên
      if (!isBlank(fullName)) target.fullName = fullName.trim()
      if (phone != null) target.phone = isBlank(phone) ? null : phone.trim()
      if (identityNumber != null) target.identityNumber = isBlank(identityNumber) ? null : identityNumber.trim()
      target.updatedAt = new Date().toISOString()
      audit(userId, 'AdminUpdateUserProfile', target.userId)
      saveDb()
      return HttpResponse.json(userDto(target))
    }),
  ),

  http.post(
    '*/api/admin/users/:userId/reset-password',
    adminRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['newPassword'])) return problem(400, 'Unknown fields.')
      if (typeof body?.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 1024) {
        return problem(400, 'NewPassword must be 12 to 1024 characters.')
      }
      const target = getDb().users.find((user) => user.userId === Number(params.userId))
      if (!target) return problem(404, 'Không tìm thấy người dùng.')
      target.password = body.newPassword
      target.updatedAt = new Date().toISOString()
      audit(userId, 'AdminResetUserPassword', target.userId)
      saveDb()
      return HttpResponse.json({ message: 'Đặt lại mật khẩu cho người dùng thành công.' })
    }),
  ),

  http.get(
    '*/api/admin/roles',
    adminRoute(() => {
      const users = getDb().users.filter((user) => (user.status ?? 'Active') === 'Active')
      return HttpResponse.json(ROLE_MATRIX.map((role) => ({ ...role, activeUsersCount: users.filter((user) => user.roles.includes(role.roleName)).length })))
    }),
  ),

  http.get('*/api/admin/security/alerts', adminRoute(() => HttpResponse.json(securityDashboard()))),

  http.get('*/api/admin/system/config', adminRoute(() => HttpResponse.json(readConfig()))),

  http.put(
    '*/api/admin/system/config',
    adminRoute(({ userId, body }) => {
      if (hasUnknownFields(body, CONFIG_GROUPS)) return problem(400, 'Request contains fields outside the contract.')
      const config = readConfig()
      CONFIG_GROUPS.forEach((group) => {
        if (body?.[group]) config[group] = body[group]
      })
      config.lastUpdatedAt = new Date().toISOString()
      config.updatedByAdminEmail = adminEmail(userId)
      audit(userId, 'UpdateSystemConfig', null, 'SystemConfig')
      saveDb()
      return HttpResponse.json(config)
    }),
  ),

  http.get('*/api/admin/system/key-rotation', adminRoute(() => HttpResponse.json(keySummary()))),

  http.post(
    '*/api/admin/system/key-rotation/rotate',
    adminRoute(({ userId }) => {
      const now = new Date().toISOString()
      readKeys()
        .filter((key) => key.status === 'Active')
        .forEach((key) => {
          key.keyVersion += 1
          key.rotatedAt = now
        })
      audit(userId, 'RotateEncryptionKeys', null, 'EncryptionKey')
      saveDb()
      return HttpResponse.json(keySummary())
    }),
  ),

  http.get(
    '*/api/admin/integrations',
    adminRoute(() => {
      const now = new Date().toISOString()
      return HttpResponse.json(
        Object.entries(INTEGRATIONS).map(([serviceId, item]) => ({
          serviceId,
          serviceName: item.name,
          serviceType: item.type,
          provider: item.provider,
          status: 'Connected',
          latencyMs: 35,
          lastCheckedAt: now,
          endpointUrl: item.endpoint,
          errorMessage: null,
        })),
      )
    }),
  ),

  http.post(
    '*/api/admin/integrations/:serviceId/ping',
    adminRoute(({ userId, params }) => {
      const item = INTEGRATIONS[params.serviceId]
      if (!item) return problem(404, `Không tìm thấy dịch vụ tích hợp '${params.serviceId}'.`)
      audit(userId, 'TestIntegrationConnection', null, 'Integration')
      saveDb()
      return HttpResponse.json({
        serviceId: params.serviceId,
        success: true,
        latencyMs: 27,
        message: `Kết nối tới dịch vụ ${item.name} (${item.provider}) thành công.`,
        testedAt: new Date().toISOString(),
      })
    }),
  ),
]

export const adminHandlers = [
  ...extraAdminHandlers,
  http.get(
    '*/api/admin/users',
    adminRoute(({ request }) => {
      const url = new URL(request.url)
      const paging = readPaging(url)
      if (!paging) return problem(400, 'Invalid paging parameters.')
      const role = url.searchParams.get('role')
      const status = url.searchParams.get('status')
      const userId = url.searchParams.get('userId')?.trim()
      const items = getDb()
        .users.map(userDto)
        .filter((user) => !userId || String(user.userId) === userId)
        .filter((user) => !role?.trim() || user.roles.includes(role))
        .filter((user) => !status?.trim() || user.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.userId - a.userId)
        .slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize)
      return HttpResponse.json({ ...paging, items })
    }),
  ),

  http.post(
    '*/api/admin/users',
    adminRoute(({ userId, body }) => {
      if (hasUnknownFields(body, ['fullName', 'email', 'password', 'phone', 'identityNumber', 'roles'])) return problem(400, 'Unknown fields.')
      const { fullName, email, password, phone, identityNumber, roles } = body ?? {}
      if (isBlank(fullName) || fullName.length > 100) return problem(400, 'FullName is required (max 100).')
      if (isBlank(email) || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem(400, 'Email is invalid.')
      if (typeof password !== 'string' || password.length < 12 || password.length > 1024) return problem(400, 'Password must be 12 to 1024 characters.')
      if (!Array.isArray(roles)) return problem(400, 'Roles is required.')

      const db = getDb()
      const normalizedEmail = email.trim().toLowerCase()
      if (db.users.some((user) => user.email.toLowerCase() === normalizedEmail)) return problem(409, 'Email đã được sử dụng.')
      const now = new Date().toISOString()
      const user = {
        userId: nextId('user'),
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: isBlank(phone) ? null : phone.trim(),
        identityNumber: isBlank(identityNumber) ? null : identityNumber.trim(),
        password,
        roles: cleanRoles(roles),
        status: 'Active',
        createdAt: now,
        updatedAt: now,
      }
      db.users.push(user)
      audit(userId, 'AdminCreateUser', user.userId)
      saveDb()
      return HttpResponse.json(userDto(user), { status: 201 })
    }),
  ),

  http.put(
    '*/api/admin/users/:userId/roles',
    adminRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['roles']) || !Array.isArray(body?.roles)) return problem(400, 'Roles is required.')
      const target = getDb().users.find((user) => user.userId === Number(params.userId))
      if (!target) return problem(404, 'Không tìm thấy người dùng.')
      target.roles = cleanRoles(body.roles)
      target.updatedAt = new Date().toISOString()
      audit(userId, 'UpdateUserRoles', target.userId)
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.put(
    '*/api/admin/users/:userId/status',
    adminRoute(({ userId, params, body }) => {
      if (hasUnknownFields(body, ['status']) || !VALID_STATUSES.includes(body?.status)) return problem(400, 'Status must be Active, Disabled or Locked.')
      const target = getDb().users.find((user) => user.userId === Number(params.userId))
      if (!target) return problem(404, 'Không tìm thấy người dùng.')
      target.status = body.status
      target.updatedAt = new Date().toISOString()
      audit(userId, 'UpdateUserStatus', target.userId)
      saveDb()
      return new HttpResponse(null, { status: 204 })
    }),
  ),

  http.get(
    '*/api/admin/audit-logs',
    adminRoute(({ request }) => {
      const url = new URL(request.url)
      const paging = readPaging(url)
      if (!paging) return problem(400, 'Invalid paging parameters.')
      const action = url.searchParams.get('action')
      const db = getDb()
      const items = db.activityLogs
        .filter((log) => !action?.trim() || log.action === action)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.logId - a.logId)
        .slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize)
        .map((log) => ({
          logId: log.logId,
          userId: log.userId ?? null,
          userEmail: db.users.find((user) => user.userId === log.userId)?.email ?? null,
          action: log.action,
          entityType: log.entityType ?? null,
          entityId: log.entityId ?? null,
          result: log.result,
          ipaddress: log.ipAddress ?? null,
          timestamp: log.timestamp,
        }))
      return HttpResponse.json({ ...paging, items })
    }),
  ),
]
