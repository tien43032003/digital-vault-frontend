import { getDb, getSessionUserId, nextId, saveDb } from './db'

// Ghi một dòng nhật ký cho người dùng hiện tại (BE thật đã ghi AuditLog nhưng chưa có API đọc)
export function recordActivity({ userId, action, entityType = null, entityId = null, result = 'Success' }) {
  const owner = userId ?? getSessionUserId()
  if (owner === null || owner === undefined) return
  getDb().activityLogs.push({
    logId: nextId('log'),
    userId: owner,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    result,
  })
  saveDb()
}

const ASSET_DOCUMENTS = /^\/owner\/assets\/(\d+)\/documents$/
const ASSET_BENEFICIARIES = /^\/owner\/assets\/(\d+)\/beneficiaries$/
const ASSET_ALLOCATION = /^\/owner\/assets\/(\d+)\/allocations\/\d+$/
const ASSET_ALLOCATION_REVOKE = /^\/owner\/assets\/(\d+)\/allocations\/\d+\/revoke$/
const ASSET_REVOKE = /^\/owner\/assets\/(\d+)\/revoke$/
const DOCUMENT_DOWNLOAD = /^\/owner\/assets\/(\d+)\/documents\/\d+\/content$/
const ASSET_ITEM = /^\/owner\/assets\/(\d+)$/
const VAULT_EXECUTOR = /^\/owner\/vaults\/(\d+)\/executor$/
const VAULT_EXECUTOR_REVOKE = /^\/owner\/vaults\/(\d+)\/executor\/revoke$/

// Từ một request thành công, suy ra dòng nhật ký tương ứng; trả null nếu không phải thao tác cần ghi
export function describeRequest({ method, url }, status, data) {
  const verb = (method ?? 'get').toLowerCase()
  const path = (url ?? '').split('?')[0]

  if (verb === 'post' && path === '/auth/login') {
    return { userId: data?.userId, action: 'Login', entityType: 'User', entityId: data?.userId ?? null, result: 'Success' }
  }
  if (verb === 'post' && path === '/auth/logout') return { action: 'Logout', result: 'Success' }
  if (verb === 'post' && path === '/owner/vaults') {
    return { action: 'CreateVault', entityType: 'DigitalVault', entityId: data?.vaultId ?? null, result: 'Success' }
  }
  if (verb === 'post' && path === '/owner/assets') {
    return { action: 'CreateAsset', entityType: 'DigitalAsset', entityId: data?.assetId ?? null, result: 'Success' }
  }
  const beneficiaries = verb === 'post' ? ASSET_BENEFICIARIES.exec(path) : null
  if (beneficiaries) {
    return { action: 'AssignBeneficiary', entityType: 'DigitalAsset', entityId: Number(beneficiaries[1]), result: 'Success' }
  }
  const documents = verb === 'post' ? ASSET_DOCUMENTS.exec(path) : null
  if (documents) {
    return {
      action: 'UploadAssetDocument',
      entityType: 'DigitalAsset',
      entityId: Number(documents[1]),
      result: 'Alive_Signed',
    }
  }
  const download = verb === 'get' ? DOCUMENT_DOWNLOAD.exec(path) : null
  if (download) return { action: 'DownloadDocument', entityType: 'DigitalAsset', entityId: Number(download[1]), result: 'Success' }
  const allocation = ASSET_ALLOCATION.exec(path)
  if (allocation && verb === 'put') return { action: 'UpdateAllocation', entityType: 'DigitalAsset', entityId: Number(allocation[1]), result: 'Success' }
  const allocationRevoke = verb === 'post' ? ASSET_ALLOCATION_REVOKE.exec(path) : null
  if (allocationRevoke) return { action: 'RemoveBeneficiary', entityType: 'DigitalAsset', entityId: Number(allocationRevoke[1]), result: 'Success' }
  const assetRevoke = verb === 'post' ? ASSET_REVOKE.exec(path) : null
  if (assetRevoke) return { action: 'RevokeAsset', entityType: 'DigitalAsset', entityId: Number(assetRevoke[1]), result: 'Success' }
  const asset = ASSET_ITEM.exec(path)
  if (asset && verb === 'put') return { action: 'UpdateAsset', entityType: 'DigitalAsset', entityId: Number(asset[1]), result: 'Success' }
  const executor = VAULT_EXECUTOR.exec(path)
  if (executor && verb === 'put') return { action: 'AssignExecutor', entityType: 'DigitalVault', entityId: Number(executor[1]), result: 'Success' }
  const executorRevoke = verb === 'post' ? VAULT_EXECUTOR_REVOKE.exec(path) : null
  if (executorRevoke) return { action: 'RevokeExecutor', entityType: 'DigitalVault', entityId: Number(executorRevoke[1]), result: 'Success' }
  if (verb === 'put' && path === '/owner/profile') return { action: 'UpdateProfile', result: 'Success' }
  // Chỉ bước xác nhận OTP mới thật sự đổi mật khẩu nên mới ghi nhật ký
  if (verb === 'post' && path === '/auth/change-password/confirm') return { action: 'ChangePassword', result: 'Success' }
  if (verb === 'put' && path === '/owner/security/two-factor') return { action: 'ToggleTwoFactor', result: 'Success' }
  if (verb === 'post' && path === '/owner/life-confirmation') return { action: 'ConfirmAlive', result: 'Success' }
  return null
}

// Gắn vào axios: ghi nhật ký sau mỗi request thành công. Người dùng được lấy lúc gửi request vì
// một số phản hồi (đăng xuất) xóa phiên trước khi trả về. Trả về hàm gỡ bỏ.
export function installActivityRecorder(client) {
  const requestId = client.interceptors.request.use((config) => {
    config.activityUserId = getSessionUserId()
    return config
  })
  const responseId = client.interceptors.response.use((response) => {
    try {
      const entry = describeRequest(response.config, response.status, response.data)
      if (entry) recordActivity({ ...entry, userId: entry.userId ?? response.config.activityUserId })
    } catch {
      // Lỗi ghi nhật ký không được làm hỏng request gốc
    }
    return response
  })
  return () => {
    client.interceptors.request.eject(requestId)
    client.interceptors.response.eject(responseId)
  }
}
