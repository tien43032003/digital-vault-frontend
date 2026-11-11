import axiosClient from './axiosClient'
import {
  getAdminRoles,
  getAdminUsers,
  getPlanMonthlyStats,
  getPlanStatistics,
  getPlanSubscribers,
  getIntegrations,
  getKeyRotation,
  getSecurityAlerts,
  getSystemConfig,
  pingIntegration,
  resetUserPassword,
  rotateEncryptionKeys,
  updateAdminUser,
  updateSystemConfig,
} from './adminApi'

vi.mock('./axiosClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('adminApi plan statistics', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getPlanMonthlyStats_Month_SendsMonthParam', async () => {
    axiosClient.get.mockResolvedValue({ data: { month: '2026-11', totalSold: 3, totalRevenue: 297000, items: [] } })
    await expect(getPlanMonthlyStats('2026-11')).resolves.toMatchObject({ totalSold: 3 })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/subscription-plans/stats', { params: { month: '2026-11' } })
  })

  it('getPlanMonthlyStats_NoMonth_SendsNoParams', async () => {
    axiosClient.get.mockResolvedValue({ data: {} })
    await getPlanMonthlyStats()
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/subscription-plans/stats', { params: undefined })
  })

  it('getPlanStatistics_ArrayOrPage_ReturnsArray', async () => {
    axiosClient.get.mockResolvedValueOnce({ data: [{ planId: 1 }] })
    await expect(getPlanStatistics()).resolves.toEqual([{ planId: 1 }])
    axiosClient.get.mockResolvedValueOnce({ data: { items: [{ planId: 2 }] } })
    await expect(getPlanStatistics()).resolves.toEqual([{ planId: 2 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/subscription-plans/statistics')
  })

  it('getPlanSubscribers_StatusAndPaging_SendsParamsAndOmitsEmptyStatus', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 2, pageSize: 10, total: 30, items: [] } })
    await getPlanSubscribers(4, { page: 2, pageSize: 10, status: 'Active' })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/subscription-plans/4/subscribers', { params: { page: 2, pageSize: 10, status: 'Active' } })
    await getPlanSubscribers(4)
    expect(axiosClient.get).toHaveBeenLastCalledWith('/admin/subscription-plans/4/subscribers', { params: { page: 1, pageSize: 20 } })
  })
})

describe('adminApi users', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getAdminUsers_NoFilters_SendsOnlyPaging', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 20, items: [] } })
    await getAdminUsers()
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1, pageSize: 20 } })
  })

  it('getAdminUsers_UserIdWithHashAndSpaces_SendsCleanUserId', async () => {
    axiosClient.get.mockResolvedValue({ data: { items: [] } })
    await getAdminUsers({ role: 'Owner', status: 'Active', userId: ' #15 ' })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/users', { params: { page: 1, pageSize: 20, role: 'Owner', status: 'Active', userId: '15' } })
  })

  it('updateAdminUser_Input_PutsTrimmedFieldsAndReturnsUser', async () => {
    axiosClient.put.mockResolvedValue({ data: { userId: 3, fullName: 'An' } })
    await expect(updateAdminUser(3, { fullName: '  An ', phone: ' 0912345678 ', identityNumber: '' })).resolves.toEqual({ userId: 3, fullName: 'An' })
    expect(axiosClient.put).toHaveBeenCalledWith('/admin/users/3', { fullName: 'An', phone: '0912345678', identityNumber: '' })
  })

  it('resetUserPassword_NewPassword_PostsToResetEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ data: { message: 'ok' } })
    await expect(resetUserPassword(4, 'MatKhauMoi12345')).resolves.toEqual({ message: 'ok' })
    expect(axiosClient.post).toHaveBeenCalledWith('/admin/users/4/reset-password', { newPassword: 'MatKhauMoi12345' })
  })
})

describe('adminApi system', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getAdminRoles_Called_GetsRoleMatrix', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ roleId: 1 }] })
    await expect(getAdminRoles()).resolves.toEqual([{ roleId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/roles')
  })

  it('getSecurityAlerts_Called_GetsDashboard', async () => {
    axiosClient.get.mockResolvedValue({ data: { activeAlertsCount: 2 } })
    await expect(getSecurityAlerts()).resolves.toEqual({ activeAlertsCount: 2 })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/security/alerts')
  })

  it('getSystemConfig_Called_GetsConfig', async () => {
    axiosClient.get.mockResolvedValue({ data: { lastUpdatedAt: 'x' } })
    await expect(getSystemConfig()).resolves.toEqual({ lastUpdatedAt: 'x' })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/system/config')
  })

  it('updateSystemConfig_Policies_PutsAndReturnsNewConfig', async () => {
    axiosClient.put.mockResolvedValue({ data: { lastUpdatedAt: 'y' } })
    const input = { proofOfLifePolicy: { defaultPingIntervalDays: 45, gracePeriodDays: 10, warningDaysBeforeGrace: 3 } }
    await expect(updateSystemConfig(input)).resolves.toEqual({ lastUpdatedAt: 'y' })
    expect(axiosClient.put).toHaveBeenCalledWith('/admin/system/config', input)
  })

  it('getKeyRotation_Called_GetsSummary', async () => {
    axiosClient.get.mockResolvedValue({ data: { totalKeys: 3 } })
    await expect(getKeyRotation()).resolves.toEqual({ totalKeys: 3 })
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/system/key-rotation')
  })

  it('rotateEncryptionKeys_Called_PostsEmptyBodyAndReturnsSummary', async () => {
    axiosClient.post.mockResolvedValue({ data: { rotatedKeys: 3 } })
    await expect(rotateEncryptionKeys()).resolves.toEqual({ rotatedKeys: 3 })
    expect(axiosClient.post).toHaveBeenCalledWith('/admin/system/key-rotation/rotate', {})
  })

  it('getIntegrations_Called_GetsList', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ serviceId: 'ca-vnpt' }] })
    await expect(getIntegrations()).resolves.toEqual([{ serviceId: 'ca-vnpt' }])
    expect(axiosClient.get).toHaveBeenCalledWith('/admin/integrations')
  })

  it('pingIntegration_ServiceId_PostsEncodedPing', async () => {
    axiosClient.post.mockResolvedValue({ data: { success: true } })
    await expect(pingIntegration('ekyc-vnpt')).resolves.toEqual({ success: true })
    expect(axiosClient.post).toHaveBeenCalledWith('/admin/integrations/ekyc-vnpt/ping')
  })
})
