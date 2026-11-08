import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import { DEMO_ACCOUNT, ROLE_ACCOUNTS, getDb, resetMockDb, saveDb } from './db'
import { handlers } from './handlers'

const server = setupServer(...handlers)
const admin = ROLE_ACCOUNTS.find((account) => account.role === 'Admin')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await axiosClient.post('/auth/login', { email: admin.email, password: admin.password })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const call = async (promise) => {
  try {
    const response = await promise
    return { status: response.status, data: response.data }
  } catch (error) {
    return { status: error.status, message: error.message }
  }
}

const newUser = (overrides = {}) => ({
  fullName: 'Phạm Thu Hà',
  email: 'Ha.Pham@Example.com',
  password: 'MatKhau@12345',
  roles: ['Executor', 'Executor', 'Khong.Ton.Tai'],
  ...overrides,
})

describe('mock admin access control', () => {
  it('getUsers_OwnerRole_Returns403', async () => {
    await axiosClient.post('/auth/login', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
    expect((await call(axiosClient.get('/admin/users'))).status).toBe(403)
  })
})

describe('mock admin users list', () => {
  it('getUsers_Default_ReturnsPageDtoWithUserFields', async () => {
    const { status, data } = await call(axiosClient.get('/admin/users'))
    expect(status).toBe(200)
    expect(data).toMatchObject({ page: 1, pageSize: 20 })
    expect(data.items).toHaveLength(8)
    expect(data.items[0]).toEqual(
      expect.objectContaining({ userId: expect.any(Number), fullName: expect.any(String), status: 'Active', roles: expect.any(Array), createdAt: expect.any(String) }),
    )
  })

  it('getUsers_PageSize_SlicesPages', async () => {
    const first = (await axiosClient.get('/admin/users', { params: { page: 1, pageSize: 5 } })).data.items
    const second = (await axiosClient.get('/admin/users', { params: { page: 2, pageSize: 5 } })).data.items
    expect(first).toHaveLength(5)
    expect(second).toHaveLength(3)
    expect(first.map((user) => user.userId)).not.toContain(second[0].userId)
  })

  it('getUsers_InvalidPaging_Returns400', async () => {
    expect((await call(axiosClient.get('/admin/users', { params: { page: 0 } }))).status).toBe(400)
    expect((await call(axiosClient.get('/admin/users', { params: { pageSize: 101 } }))).status).toBe(400)
  })

  it('getUsers_RoleFilter_ReturnsOnlyThatRole', async () => {
    const { data } = await axiosClient.get('/admin/users', { params: { role: 'Executor' } })
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items.every((user) => user.roles.includes('Executor'))).toBe(true)
  })

  it('getUsers_UserIdFilter_ReturnsOnlyThatUser', async () => {
    const { data } = await axiosClient.get('/admin/users', { params: { userId: '2' } })
    expect(data.items.map((user) => user.userId)).toEqual([2])
  })

  it('getUsers_UserIdNotFound_ReturnsEmptyList', async () => {
    const { data } = await axiosClient.get('/admin/users', { params: { userId: '99999' } })
    expect(data.items).toEqual([])
  })

  it('getUsers_StatusFilter_ReturnsOnlyThatStatus', async () => {
    await axiosClient.put('/admin/users/2/status', { status: 'Locked' })
    const { data } = await axiosClient.get('/admin/users', { params: { status: 'Locked' } })
    expect(data.items.map((user) => user.userId)).toEqual([2])
  })
})

describe('mock admin create user', () => {
  it('createUser_Valid_Returns201WithNormalizedEmailAndKnownRolesOnly', async () => {
    const { status, data } = await call(axiosClient.post('/admin/users', newUser()))
    expect(status).toBe(201)
    expect(data).toMatchObject({ email: 'ha.pham@example.com', status: 'Active', roles: ['Executor'] })
    expect(data).not.toHaveProperty('password')
  })

  it('createUser_NewestFirstInList', async () => {
    const { data: created } = await axiosClient.post('/admin/users', newUser())
    const { data } = await axiosClient.get('/admin/users')
    expect(data.items[0].userId).toBe(created.userId)
  })

  it('createUser_CreatedAccount_CanLogIn', async () => {
    await axiosClient.post('/admin/users', newUser({ roles: ['Owner'] }))
    const result = await call(axiosClient.post('/auth/login', { email: 'ha.pham@example.com', password: 'MatKhau@12345' }))
    expect(result.status).toBe(200)
  })

  it('createUser_DuplicateEmail_Returns409', async () => {
    const result = await call(axiosClient.post('/admin/users', newUser({ email: 'LONG.TRAN@example.com' })))
    expect(result.status).toBe(409)
    expect(result.message).toBe('Email đã được sử dụng.')
  })

  it.each([
    ['ShortPassword', { password: 'ngan' }],
    ['InvalidEmail', { email: 'khong-hop-le' }],
    ['BlankName', { fullName: ' ' }],
    ['MissingRoles', { roles: undefined }],
    ['UnknownField', { isAdmin: true }],
  ])('createUser_%s_Returns400', async (_name, overrides) => {
    expect((await call(axiosClient.post('/admin/users', newUser(overrides)))).status).toBe(400)
  })
})

describe('mock admin update roles and status', () => {
  it('updateRoles_Valid_ReplacesRolesWith204', async () => {
    expect((await call(axiosClient.put('/admin/users/2/roles', { roles: ['Executor'] }))).status).toBe(204)
    const { data } = await axiosClient.get('/admin/users', { params: { role: 'Executor' } })
    expect(data.items.find((user) => user.userId === 2).roles).toEqual(['Executor'])
  })

  it('updateRoles_UnknownUser_Returns404', async () => {
    expect((await call(axiosClient.put('/admin/users/999/roles', { roles: ['Owner'] }))).status).toBe(404)
  })

  it('updateRoles_MissingRoles_Returns400', async () => {
    expect((await call(axiosClient.put('/admin/users/2/roles', {}))).status).toBe(400)
  })

  it('updateStatus_Valid_Returns204AndPersists', async () => {
    expect((await call(axiosClient.put('/admin/users/2/status', { status: 'Disabled' }))).status).toBe(204)
    const { data } = await axiosClient.get('/admin/users')
    expect(data.items.find((user) => user.userId === 2).status).toBe('Disabled')
  })

  it('updateStatus_InvalidValue_Returns400', async () => {
    expect((await call(axiosClient.put('/admin/users/2/status', { status: 'Banned' }))).status).toBe(400)
  })

  it('updateStatus_UnknownUser_Returns404', async () => {
    expect((await call(axiosClient.put('/admin/users/999/status', { status: 'Locked' }))).status).toBe(404)
  })
})

describe('mock admin audit logs', () => {
  it('getAuditLogs_Default_ReturnsPageDtoNewestFirstWithActorEmail', async () => {
    const { status, data } = await call(axiosClient.get('/admin/audit-logs'))
    expect(status).toBe(200)
    expect(data).toMatchObject({ page: 1, pageSize: 20 })
    const times = data.items.map((log) => log.timestamp)
    expect(times).toEqual([...times].sort().reverse())
    expect(data.items[0]).toEqual(expect.objectContaining({ logId: expect.any(Number), action: expect.any(String), result: expect.any(String) }))
    expect(data.items.some((log) => log.userEmail === 'owner@example.com')).toBe(true)
  })

  it('getAuditLogs_ActionFilter_ReturnsExactActionOnly', async () => {
    const { data } = await axiosClient.get('/admin/audit-logs', { params: { action: 'CreateAsset' } })
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items.every((log) => log.action === 'CreateAsset')).toBe(true)
  })

  it('getAuditLogs_PageSize_SlicesPages', async () => {
    const first = (await axiosClient.get('/admin/audit-logs', { params: { page: 1, pageSize: 5 } })).data.items
    const second = (await axiosClient.get('/admin/audit-logs', { params: { page: 2, pageSize: 5 } })).data.items
    expect(first).toHaveLength(5)
    expect(second.map((log) => log.logId)).not.toContain(first[0].logId)
  })

  it('getAuditLogs_InvalidPaging_Returns400', async () => {
    expect((await call(axiosClient.get('/admin/audit-logs', { params: { pageSize: 0 } }))).status).toBe(400)
  })

  it('getAuditLogs_OwnerRole_Returns403', async () => {
    await axiosClient.post('/auth/login', { email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password })
    expect((await call(axiosClient.get('/admin/audit-logs'))).status).toBe(403)
  })

  it('adminActions_AreRecordedInAuditLog', async () => {
    await axiosClient.post('/admin/users', newUser())
    await axiosClient.put('/admin/users/2/roles', { roles: ['Owner'] })
    await axiosClient.put('/admin/users/2/status', { status: 'Locked' })
    const { data } = await axiosClient.get('/admin/audit-logs', { params: { pageSize: 3 } })
    expect(data.items.map((log) => log.action)).toEqual(['UpdateUserStatus', 'UpdateUserRoles', 'AdminCreateUser'])
    expect(data.items.every((log) => log.userEmail === 'admin@example.com')).toBe(true)
  })
})

describe('mock admin edit user and reset password', () => {
  it('updateUser_Fields_TrimsAndReturnsUpdatedUser', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    const { status, data } = await call(axiosClient.put(`/admin/users/${created.userId}`, { fullName: '  Hà Mới ', phone: ' 0912345678 ', identityNumber: '' }))
    expect(status).toBe(200)
    expect(data).toMatchObject({ userId: created.userId, fullName: 'Hà Mới', phone: '0912345678', identityNumber: null })
  })

  it('updateUser_BlankFullName_KeepsOldName', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    const { data } = await call(axiosClient.put(`/admin/users/${created.userId}`, { fullName: ' ', phone: '', identityNumber: '' }))
    expect(data.fullName).toBe('Phạm Thu Hà')
  })

  it('updateUser_TooLongPhoneOrUnknownField_Returns400', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    expect((await call(axiosClient.put(`/admin/users/${created.userId}`, { phone: '1'.repeat(21) }))).status).toBe(400)
    expect((await call(axiosClient.put(`/admin/users/${created.userId}`, { email: 'x@y.vn' }))).status).toBe(400)
  })

  it('updateUser_UnknownUser_Returns404', async () => {
    expect((await call(axiosClient.put('/admin/users/9999', { fullName: 'A' }))).status).toBe(404)
  })

  it('updateUser_Success_WritesAuditLog', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    await call(axiosClient.put(`/admin/users/${created.userId}`, { fullName: 'B' }))
    const { data } = await call(axiosClient.get('/admin/audit-logs', { params: { action: 'AdminUpdateUserProfile' } }))
    expect(data.items[0]).toMatchObject({ action: 'AdminUpdateUserProfile', entityType: 'User', entityId: created.userId })
  })

  it('resetPassword_ValidPassword_ChangesLoginPassword', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    const { status, data } = await call(axiosClient.post(`/admin/users/${created.userId}/reset-password`, { newPassword: 'MatKhauMoi@2026' }))
    expect(status).toBe(200)
    expect(data.message).toBeTruthy()
    const login = await call(axiosClient.post('/auth/login', { email: 'ha.pham@example.com', password: 'MatKhauMoi@2026' }))
    expect(login.status).toBe(200)
  })

  it('resetPassword_ShortPassword_Returns400', async () => {
    const created = (await call(axiosClient.post('/admin/users', newUser()))).data
    expect((await call(axiosClient.post(`/admin/users/${created.userId}/reset-password`, { newPassword: 'ngan' }))).status).toBe(400)
  })

  it('resetPassword_UnknownUser_Returns404', async () => {
    expect((await call(axiosClient.post('/admin/users/9999/reset-password', { newPassword: 'MatKhauMoi@2026' }))).status).toBe(404)
  })
})

describe('mock admin roles matrix', () => {
  it('getRoles_Admin_ReturnsFiveRolesWithPermissionsAndActiveCounts', async () => {
    const { status, data } = await call(axiosClient.get('/admin/roles'))
    expect(status).toBe(200)
    expect(data.map((role) => role.roleName)).toEqual(['Owner', 'Executor', 'LegalVerifier', 'Beneficiary', 'Admin'])
    expect(data[0].permissions).toContain('vault:create')
    expect(data.find((role) => role.roleName === 'Admin').activeUsersCount).toBeGreaterThanOrEqual(1)
  })

  it('getRoles_DisabledUser_IsNotCounted', async () => {
    const before = (await call(axiosClient.get('/admin/roles'))).data.find((role) => role.roleName === 'Owner').activeUsersCount
    const created = (await call(axiosClient.post('/admin/users', newUser({ roles: ['Owner'] })))).data
    await call(axiosClient.put(`/admin/users/${created.userId}/status`, { status: 'Disabled' }))
    const after = (await call(axiosClient.get('/admin/roles'))).data.find((role) => role.roleName === 'Owner').activeUsersCount
    expect(after).toBe(before)
  })
})

describe('mock admin security alerts', () => {
  const seedLogs = (rows) => {
    const db = getDb()
    db.activityLogs = rows.map((row, index) => ({ logId: index + 1, userId: 1, action: 'FailedLogin', entityType: 'User', entityId: 1, result: 'Failed', ipAddress: '10.0.0.1', timestamp: new Date().toISOString(), ...row }))
    saveDb()
  }

  it('getAlerts_NoLogs_ReturnsZerosAndNoAlerts', async () => {
    seedLogs([])
    const { data } = await call(axiosClient.get('/admin/security/alerts'))
    expect(data).toMatchObject({ totalAuditLogs24h: 0, failedActions24h: 0, activeAlertsCount: 0, failureRatePercentage: 0, recentAlerts: [], topFailedActions: [] })
  })

  it('getAlerts_OnlySuccessLogs_ReturnsInfoNormalAlertNotCounted', async () => {
    seedLogs([{ action: 'Login', result: 'Success' }])
    const { data } = await call(axiosClient.get('/admin/security/alerts'))
    expect(data.recentAlerts.map((alert) => alert.alertId)).toEqual(['INFO-NORMAL'])
    expect(data.activeAlertsCount).toBe(0)
  })

  it('getAlerts_ManyFailures_RaisesSpikeUserAndBruteForceAlerts', async () => {
    seedLogs(Array.from({ length: 5 }, () => ({})))
    const { data } = await call(axiosClient.get('/admin/security/alerts'))
    expect(data.failedActions24h).toBe(5)
    expect(data.failureRatePercentage).toBe(100)
    const ids = data.recentAlerts.map((alert) => alert.alertId)
    expect(ids).toContain('ALERT-SPIKE-FAIL')
    expect(ids).toContain('ALERT-FAIL-USER-1')
    expect(ids.some((id) => id.startsWith('ALERT-IP-BRUTE-'))).toBe(true)
    expect(data.activeAlertsCount).toBe(3)
    expect(data.topFailedActions).toEqual([{ key: 'FailedLogin', value: 5 }])
  })

  it('getAlerts_OldLogs_AreIgnored', async () => {
    seedLogs(Array.from({ length: 6 }, () => ({ timestamp: new Date(Date.now() - 48 * 3600000).toISOString() })))
    const { data } = await call(axiosClient.get('/admin/security/alerts'))
    expect(data.totalAuditLogs24h).toBe(0)
  })
})

describe('mock admin system config', () => {
  it('getConfig_Default_ReturnsFourPolicies', async () => {
    const { status, data } = await call(axiosClient.get('/admin/system/config'))
    expect(status).toBe(200)
    expect(data.encryptionPolicy).toEqual({ defaultAlgorithm: 'AES-256-GCM', keyRotationIntervalDays: 90, minPasswordLength: 12, require2FAForAdmin: true })
    expect(data.proofOfLifePolicy).toEqual({ defaultPingIntervalDays: 30, gracePeriodDays: 7, warningDaysBeforeGrace: 3 })
    expect(data.storagePolicy.allowedExtensions).toContain('.pdf')
    expect(data.backupPolicy).toMatchObject({ autoBackupEnabled: true, retentionDays: 30 })
  })

  it('updateConfig_OnePolicy_ReplacesOnlyThatPolicyAndStampsAdmin', async () => {
    const { status, data } = await call(
      axiosClient.put('/admin/system/config', { proofOfLifePolicy: { defaultPingIntervalDays: 45, gracePeriodDays: 10, warningDaysBeforeGrace: 3 } }),
    )
    expect(status).toBe(200)
    expect(data.proofOfLifePolicy.defaultPingIntervalDays).toBe(45)
    expect(data.encryptionPolicy.keyRotationIntervalDays).toBe(90)
    expect(data.updatedByAdminEmail).toBe(admin.email)
    expect((await call(axiosClient.get('/admin/system/config'))).data.proofOfLifePolicy.gracePeriodDays).toBe(10)
  })

  it('updateConfig_UnknownGroup_Returns400', async () => {
    expect((await call(axiosClient.put('/admin/system/config', { nope: {} }))).status).toBe(400)
  })

  it('updateConfig_Success_WritesAuditLog', async () => {
    await call(axiosClient.put('/admin/system/config', { backupPolicy: { autoBackupEnabled: false, cronSchedule: '0 2 * * *', retentionDays: 10 } }))
    const { data } = await call(axiosClient.get('/admin/audit-logs', { params: { action: 'UpdateSystemConfig' } }))
    expect(data.items[0]).toMatchObject({ entityType: 'SystemConfig', result: 'Success' })
  })
})

describe('mock admin key rotation', () => {
  it('getKeyRotation_Default_ReturnsOneKeyPerAssetWithSummary', async () => {
    const { status, data } = await call(axiosClient.get('/admin/system/key-rotation'))
    expect(status).toBe(200)
    expect(data.totalKeys).toBe(getDb().assets.length)
    expect(data.activeKeys).toBe(data.totalKeys)
    expect(data.rotatedKeys).toBe(0)
    expect(data.rotationIntervalDays).toBe(90)
    expect(data.keys[0]).toMatchObject({ algorithm: 'AES-256-GCM', keyVersion: 1, status: 'Active', rotatedAt: null })
  })

  it('getKeyRotation_OldKeys_NeedRotationUntilIntervalIsLonger', async () => {
    const first = (await call(axiosClient.get('/admin/system/key-rotation'))).data
    expect(first.keysNeedingRotation).toBe(first.totalKeys)
    expect(first.keys.every((key) => key.needsRotation)).toBe(true)
    await call(axiosClient.put('/admin/system/config', { encryptionPolicy: { defaultAlgorithm: 'AES-256-GCM', keyRotationIntervalDays: 3650, minPasswordLength: 12, require2FAForAdmin: true } }))
    const second = (await call(axiosClient.get('/admin/system/key-rotation'))).data
    expect(second.rotationIntervalDays).toBe(3650)
    expect(second.keysNeedingRotation).toBe(0)
  })

  it('rotate_Active_BumpsVersionAndRecordsRotationTime', async () => {
    const before = (await call(axiosClient.get('/admin/system/key-rotation'))).data
    const { status, data } = await call(axiosClient.post('/admin/system/key-rotation/rotate', {}))
    expect(status).toBe(200)
    expect(data.rotatedKeys).toBe(before.activeKeys)
    expect(data.keysNeedingRotation).toBe(0)
    expect(data.lastRotatedAt).toBeTruthy()
    expect(data.keys.every((key) => key.keyVersion === 2 && key.rotatedAt)).toBe(true)
  })

  it('rotate_Success_WritesAuditLog', async () => {
    await call(axiosClient.post('/admin/system/key-rotation/rotate', {}))
    const { data } = await call(axiosClient.get('/admin/audit-logs', { params: { action: 'RotateEncryptionKeys' } }))
    expect(data.items[0]).toMatchObject({ entityType: 'EncryptionKey' })
  })
})

describe('mock admin integrations', () => {
  it('getIntegrations_Default_ReturnsFiveConnectedServices', async () => {
    const { status, data } = await call(axiosClient.get('/admin/integrations'))
    expect(status).toBe(200)
    expect(data.map((item) => item.serviceId)).toEqual(['ekyc-vnpt', 'ca-vnpt', 'notary-gateway', 'blob-storage', 'smtp-gateway'])
    expect(data.every((item) => item.status === 'Connected')).toBe(true)
  })

  it('ping_KnownService_ReturnsSuccessWithMessage', async () => {
    const { status, data } = await call(axiosClient.post('/admin/integrations/ekyc-vnpt/ping'))
    expect(status).toBe(200)
    expect(data).toMatchObject({ serviceId: 'ekyc-vnpt', success: true })
    expect(data.message).toContain('VNPT AI')
  })

  it('ping_UnknownService_Returns404', async () => {
    expect((await call(axiosClient.post('/admin/integrations/khong-co/ping'))).status).toBe(404)
  })

  it('ping_Success_WritesAuditLog', async () => {
    await call(axiosClient.post('/admin/integrations/ca-vnpt/ping'))
    const { data } = await call(axiosClient.get('/admin/audit-logs', { params: { action: 'TestIntegrationConnection' } }))
    expect(data.items[0]).toMatchObject({ entityType: 'Integration' })
  })
})
