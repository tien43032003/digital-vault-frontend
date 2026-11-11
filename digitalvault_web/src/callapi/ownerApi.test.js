import axiosClient from './axiosClient'
import {
  assignBeneficiary,
  createAsset,
  createVault,
  downloadDocument,
  getAllocations,
  getAsset,
  getAssets,
  assignExecutor,
  cancelHandover,
  getActivityLogs,
  getBeneficiaries,
  getExecutorDetail,
  getExecutors,
  getNotificationPage,
  getNotifications,
  markNotificationRead,
  getOwnerHandovers,
  getProfile,
  getLifeConfirmation,
  getVault,
  getVaultExecutor,
  getVaults,
  confirmAlive,
  removeBeneficiary,
  revokeAsset,
  revokeExecutor,
  setTwoFactor,
  updateAsset,
  updateBeneficiaryAllocation,
  updateProfile,
  uploadDocument,
  createOwnerHandover,
  closeVault,
  revokeDocument,
  getOwnerHandover,
  updateVault,
} from './ownerApi'

vi.mock('./axiosClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

describe('ownerApi', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('getVaults_Called_GetsVaultsAndReturnsData', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ vaultId: 1 }] })
    await expect(getVaults()).resolves.toEqual([{ vaultId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/vaults', { params: { page: 1, pageSize: 100 } })
  })

  it('getVault_WithId_GetsVaultById', async () => {
    axiosClient.get.mockResolvedValue({ data: { vaultId: 7 } })
    await expect(getVault(7)).resolves.toEqual({ vaultId: 7 })
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/vaults/7')
  })

  it('createVault_ValidInput_PostsTrimmedNameAndDescription', async () => {
    axiosClient.post.mockResolvedValue({ data: { vaultId: 2 } })
    await createVault({ name: '  Kho moi  ', description: ' Mo ta ' })
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/vaults', { name: 'Kho moi', description: 'Mo ta' })
  })

  it('createVault_BlankDescription_SendsNullDescription', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await createVault({ name: 'Kho', description: '   ' })
    expect(axiosClient.post.mock.calls[0][1].description).toBeNull()
  })

  it('getAssets_Called_GetsAssets', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ assetId: 1 }] })
    await expect(getAssets()).resolves.toEqual([{ assetId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/assets', { params: { page: 1, pageSize: 100 } })
  })

  it('getAssets_RevokedAssets_AreHiddenBecauseBackendOnlyMarksThemRevoked', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ assetId: 1, status: 'Active' }, { assetId: 2, status: 'Revoked' }] })
    await expect(getAssets()).resolves.toEqual([{ assetId: 1, status: 'Active' }])
  })

  it('getBeneficiaries_RevokedAndRejectedAllocations_AreHiddenButPendingIsKept', async () => {
    const rows = [
      { beneficiaryId: 1, status: 'Active' },
      { beneficiaryId: 2, status: 'Revoked' },
      { beneficiaryId: 3, status: 'Pending' },
      { beneficiaryId: 4, status: 'Rejected' },
    ]
    axiosClient.get.mockResolvedValue({ data: rows })
    await expect(getBeneficiaries()).resolves.toEqual([rows[0], rows[2]])
  })

  it('getAsset_WithId_GetsAssetById', async () => {
    axiosClient.get.mockResolvedValue({ data: { assetId: 3 } })
    await expect(getAsset(3)).resolves.toEqual({ assetId: 3 })
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/assets/3')
  })

  it('createAsset_ExtraFields_SendsOnlyContractFields', async () => {
    axiosClient.post.mockResolvedValue({ data: { assetId: 9 } })
    await createAsset({ vaultId: 1, name: ' Tai san ', type: 'BankAccount', description: 'Mo ta', status: 'Active' })
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/assets', {
      vaultId: 1,
      name: 'Tai san',
      type: 'BankAccount',
      description: 'Mo ta',
    })
  })

  it('createAsset_NoDescription_SendsNullDescription', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await createAsset({ vaultId: 1, name: 'A', type: 'Other' })
    expect(axiosClient.post.mock.calls[0][1].description).toBeNull()
  })

  it('getBeneficiaries_WithoutAssetId_GetsAllWithoutParams', async () => {
    axiosClient.get.mockResolvedValue({ data: [] })
    await getBeneficiaries()
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/beneficiaries', { params: { page: 1, pageSize: 100 } })
  })

  it('getBeneficiaries_WithAssetId_SendsAssetIdParam', async () => {
    axiosClient.get.mockResolvedValue({ data: [] })
    await getBeneficiaries(10)
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/beneficiaries', { params: { assetId: 10, page: 1, pageSize: 100 } })
  })

  describe('uploadDocument', () => {
    const file = new File(['pdf'], 'HopDong.pdf', { type: 'application/pdf' })
    const signature = new File(['sig'], 'HopDong.sig')

    const sentForm = () => axiosClient.post.mock.calls[0][1]

    it('uploadDocument_FileAndSignature_PostsMultipartWithContractFieldNames', async () => {
      axiosClient.post.mockResolvedValue({ data: { documentId: 9 } })
      await expect(uploadDocument(4, { file, signature })).resolves.toEqual({ documentId: 9 })
      expect(axiosClient.post.mock.calls[0][0]).toBe('/owner/assets/4/documents')
      const form = sentForm()
      expect(form).toBeInstanceOf(FormData)
      expect(form.get('File').name).toBe('HopDong.pdf')
      expect(form.get('Signature').name).toBe('HopDong.sig')
      expect([...form.keys()].sort()).toEqual(['File', 'Signature'])
    })

    it('uploadDocument_WithBeneficiary_AddsBeneficiaryId', async () => {
      axiosClient.post.mockResolvedValue({ data: {} })
      await uploadDocument(4, { file, signature, beneficiaryId: '11' })
      expect(sentForm().get('BeneficiaryId')).toBe('11')
    })

    it('uploadDocument_StrayLegacyFields_AreNeverSent', async () => {
      axiosClient.post.mockResolvedValue({ data: {} })
      await uploadDocument(4, { file, signature, ownerAlive: false, deathCertificate: file })
      const keys = [...sentForm().keys()]
      expect(keys).not.toContain('OwnerAlive')
      expect(keys).not.toContain('DeathCertificate')
      expect(keys).not.toContain('ownerAlive')
    })
  })

  it('getActivityLogs_Called_GetsLogsAndReturnsData', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ logId: 1 }] })
    await expect(getActivityLogs()).resolves.toEqual([{ logId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/activity-logs')
  })

  describe('executor', () => {
    it('getExecutors_PlainArray_ReturnsItsItemsWithPagingParams', async () => {
      axiosClient.get.mockResolvedValue({ data: [{ executorId: 5 }] })
      await expect(getExecutors()).resolves.toEqual([{ executorId: 5 }])
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/executors', { params: { page: 1, pageSize: 100 } })
    })

    it('getExecutors_BePage_MapsUserIdToExecutorId', async () => {
      axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ userId: 9, fullName: 'LS. A' }] } })
      await expect(getExecutors()).resolves.toEqual([{ userId: 9, fullName: 'LS. A', executorId: 9 }])
    })

    it('getExecutorDetail_WithVault_SendsVaultIdQuery', async () => {
      axiosClient.get.mockResolvedValue({ data: { userId: 9 } })
      await expect(getExecutorDetail(9, 3)).resolves.toEqual({ userId: 9 })
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/executors/9', { params: { vaultId: 3 } })
    })

    it('getVaultExecutor_VaultId_GetsAssignmentOfThatVault', async () => {
      axiosClient.get.mockResolvedValue({ data: { vaultId: 3 } })
      await expect(getVaultExecutor(3)).resolves.toEqual({ vaultId: 3 })
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/vaults/3/executor')
    })

    it('assignExecutor_VaultAndExecutor_PutsExecutorIdThenReadsTheAssignmentBack', async () => {
      axiosClient.put.mockResolvedValue({ status: 204 })
      axiosClient.get.mockResolvedValue({ data: { vaultId: 3, executorId: 21, status: 'Active' } })
      await expect(assignExecutor(3, '21')).resolves.toEqual({ vaultId: 3, executorId: 21, status: 'Active' })
      expect(axiosClient.put).toHaveBeenCalledWith('/owner/vaults/3/executor', { executorId: 21 })
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/vaults/3/executor')
    })

    it('assignExecutor_ReadBackUnavailable_FallsBackToMinimalActiveAssignment', async () => {
      axiosClient.put.mockResolvedValue({ status: 204 })
      axiosClient.get.mockRejectedValue({ status: 404 })
      await expect(assignExecutor(3, 21)).resolves.toMatchObject({ vaultId: 3, executorId: 21, fullName: 'Executor #21', status: 'Active' })
    })

    it('assignExecutor_PutFails_Throws', async () => {
      axiosClient.put.mockRejectedValue({ status: 409 })
      await expect(assignExecutor(3, 21)).rejects.toEqual({ status: 409 })
      expect(axiosClient.get).not.toHaveBeenCalled()
    })

    it('revokeExecutor_VaultId_PostsRevokeEndpoint', async () => {
      axiosClient.post.mockResolvedValue({ status: 204 })
      await revokeExecutor(3)
      expect(axiosClient.post).toHaveBeenCalledWith('/owner/vaults/3/executor/revoke')
    })


  })

  describe('life confirmation', () => {
    it('getLifeConfirmation_Called_GetsLastConfirmedTime', async () => {
      axiosClient.get.mockResolvedValue({ data: { ownerId: 1, lastConfirmedAliveAt: null } })
      await expect(getLifeConfirmation()).resolves.toEqual({ ownerId: 1, lastConfirmedAliveAt: null })
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/life-confirmation')
    })

    it('confirmAlive_Called_PostsWithoutBodyAndReturnsServerTime', async () => {
      axiosClient.post.mockResolvedValue({ data: { ownerId: 1, lastConfirmedAliveAt: '2026-10-22T02:00:00Z' } })
      await expect(confirmAlive()).resolves.toEqual({ ownerId: 1, lastConfirmedAliveAt: '2026-10-22T02:00:00Z' })
      expect(axiosClient.post).toHaveBeenCalledWith('/owner/life-confirmation')
    })
  })

  describe('download document', () => {
    it('downloadDocument_Ids_GetsBlobFromDocumentUrl', async () => {
      const blob = new Blob(['x'])
      axiosClient.get.mockResolvedValue({ data: blob })
      await expect(downloadDocument(4, 12)).resolves.toBe(blob)
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/assets/4/documents/12/content', { responseType: 'blob' })
    })
  })

  describe('owner handovers', () => {
    it('getOwnerHandovers_Called_GetsFirstPageOf100AndReturnsItems', async () => {
      axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ requestId: 4 }] } })
      await expect(getOwnerHandovers()).resolves.toEqual([{ requestId: 4 }])
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/handovers', { params: { page: 1, pageSize: 100 } })
    })

    it('cancelHandover_RequestId_PostsCancel', async () => {
      axiosClient.post.mockResolvedValue({ status: 204 })
      await cancelHandover(4)
      expect(axiosClient.post).toHaveBeenCalledWith('/owner/handovers/4/cancel')
    })
  })

  describe('manage beneficiaries', () => {
    const rows = [
      { assignmentId: 31, assetId: 4, beneficiaryId: 8, status: 'Revoked' },
      { assignmentId: 32, assetId: 4, beneficiaryId: 9, status: 'Active' },
    ]

    it('getAllocations_AssetId_GetsAllocationsOfThatAsset', async () => {
      axiosClient.get.mockResolvedValue({ data: rows })
      await expect(getAllocations(4)).resolves.toEqual(rows)
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/assets/4/allocations', { params: { page: 1, pageSize: 100 } })
    })

    it('updateBeneficiaryAllocation_Values_PutsToTheActiveAssignmentId', async () => {
      axiosClient.get.mockResolvedValue({ data: rows })
      axiosClient.put.mockResolvedValue({ data: { allocation: 25 } })
      await expect(updateBeneficiaryAllocation(4, 9, '25')).resolves.toEqual({ allocation: 25 })
      expect(axiosClient.put).toHaveBeenCalledWith('/owner/assets/4/allocations/32', { allocation: 25 })
    })

    it('updateBeneficiaryAllocation_NoActiveAssignment_Throws404WithoutPut', async () => {
      axiosClient.get.mockResolvedValue({ data: rows })
      await expect(updateBeneficiaryAllocation(4, 8, 10)).rejects.toMatchObject({ status: 404 })
      expect(axiosClient.put).not.toHaveBeenCalled()
    })

    it('removeBeneficiary_Ids_PostsRevokeOfTheActiveAssignment', async () => {
      axiosClient.get.mockResolvedValue({ data: rows })
      axiosClient.post.mockResolvedValue({ data: { status: 'Revoked' } })
      await removeBeneficiary(4, 9)
      expect(axiosClient.post).toHaveBeenCalledWith('/owner/assets/4/allocations/32/revoke')
    })

    it('removeBeneficiary_AlreadyRevoked_Throws404', async () => {
      axiosClient.get.mockResolvedValue({ data: rows })
      await expect(removeBeneficiary(4, 8)).rejects.toMatchObject({ status: 404 })
      expect(axiosClient.post).not.toHaveBeenCalled()
    })
  })

  describe('edit asset', () => {
    it('updateAsset_Values_PutsTrimmedNameTypeAndNullForBlankDescription', async () => {
      axiosClient.put.mockResolvedValue({ data: { assetId: 4 } })
      await expect(updateAsset(4, { name: ' Ví mới ', type: 'CryptoWallet', description: '  ', vaultId: 9 })).resolves.toEqual({ assetId: 4 })
      expect(axiosClient.put).toHaveBeenCalledWith('/owner/assets/4', { name: 'Ví mới', type: 'CryptoWallet', description: null })
    })

    it('revokeAsset_AssetId_PostsRevoke', async () => {
      axiosClient.post.mockResolvedValue({ data: undefined })
      await revokeAsset(4)
      expect(axiosClient.post).toHaveBeenCalledWith('/owner/assets/4/revoke')
    })
  })

  describe('security settings', () => {
    it('getProfile_Called_GetsProfile', async () => {
      axiosClient.get.mockResolvedValue({ data: { userId: 1 } })
      await expect(getProfile()).resolves.toEqual({ userId: 1 })
      expect(axiosClient.get).toHaveBeenCalledWith('/owner/profile')
    })

    it('updateProfile_BlankPhone_PutsTrimmedNameAndNullPhone', async () => {
      axiosClient.put.mockResolvedValue({ data: { fullName: 'An' } })
      await updateProfile({ fullName: ' An ', phone: '  ' })
      expect(axiosClient.put).toHaveBeenCalledWith('/owner/profile', { fullName: 'An', phone: null })
    })

    it('setTwoFactor_Enabled_PutsBoolean', async () => {
      axiosClient.put.mockResolvedValue({ data: { twoFactorEnabled: true } })
      await expect(setTwoFactor(true)).resolves.toEqual({ twoFactorEnabled: true })
      expect(axiosClient.put).toHaveBeenCalledWith('/owner/security/two-factor', { enabled: true })
    })
  })

  it('assignBeneficiary_ValidInput_PostsTrimmedEmailAndAllocation', async () => {
    axiosClient.post.mockResolvedValue({ data: { beneficiaryId: 5 } })
    await expect(assignBeneficiary(4, { email: ' long@example.com ', allocation: 40 })).resolves.toEqual({
      beneficiaryId: 5,
    })
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/assets/4/beneficiaries', {
      email: 'long@example.com',
      allocation: 40,
    })
  })
})

describe('createOwnerHandover', () => {
  it('createOwnerHandover_Vault_PostsToVaultHandoversAndReturnsRequest', async () => {
    axiosClient.post.mockResolvedValue({ data: { requestId: 5, status: 'Draft' } })
    await expect(createOwnerHandover(3)).resolves.toEqual({ requestId: 5, status: 'Draft' })
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/vaults/3/handovers')
  })
})

describe('getOwnerHandover', () => {
  it('getOwnerHandover_Id_GetsDetailAndReturnsData', async () => {
    axiosClient.get.mockResolvedValue({ data: { requestId: 7, status: 'Draft' } })
    await expect(getOwnerHandover(7)).resolves.toEqual({ requestId: 7, status: 'Draft' })
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/handovers/7')
  })
})

describe('updateVault', () => {
  it('updateVault_NameAndDescription_PutsTrimmedValuesAndReturnsVault', async () => {
    axiosClient.put.mockResolvedValue({ data: { vaultId: 2, name: 'Kho', description: null, status: 'Active' } })
    await expect(updateVault(2, { name: '  Kho  ', description: '   ' })).resolves.toEqual({ vaultId: 2, name: 'Kho', description: null, status: 'Active' })
    expect(axiosClient.put).toHaveBeenCalledWith('/owner/vaults/2', { name: 'Kho', description: null })
  })
})

describe('closeVault', () => {
  it('closeVault_Id_PostsCloseEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await closeVault(4)
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/vaults/4/close')
  })
})

describe('revokeDocument', () => {
  it('revokeDocument_AssetAndDocument_PostsRevokeEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await revokeDocument(3, 12)
    expect(axiosClient.post).toHaveBeenCalledWith('/owner/assets/3/documents/12/revoke')
  })
})

describe('list endpoints returning PageDto like the deployed backend', () => {
  const page = (items) => ({ data: { page: 1, pageSize: 100, items } })

  it('getVaults_PageDto_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue(page([{ vaultId: 1 }]))
    await expect(getVaults()).resolves.toEqual([{ vaultId: 1 }])
  })

  it('getAssets_PageDto_ReturnsItemsWithoutRevoked', async () => {
    axiosClient.get.mockResolvedValue(page([{ assetId: 1, status: 'Active' }, { assetId: 2, status: 'Revoked' }]))
    await expect(getAssets()).resolves.toEqual([{ assetId: 1, status: 'Active' }])
  })

  it('getBeneficiaries_PageDto_ReturnsActiveAndPendingOnly', async () => {
    axiosClient.get.mockResolvedValue(page([{ beneficiaryId: 1, status: 'Active' }, { beneficiaryId: 2, status: 'Revoked' }]))
    await expect(getBeneficiaries()).resolves.toEqual([{ beneficiaryId: 1, status: 'Active' }])
  })

  it('getAllocations_PageDto_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue(page([{ assignmentId: 5 }]))
    await expect(getAllocations(4)).resolves.toEqual([{ assignmentId: 5 }])
  })
})

describe('executors as returned by the real backend', () => {
  it('getExecutors_PageDto_AddsExecutorIdFromUserId', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ userId: 15, fullName: 'Nguyen Van A' }] } })
    await expect(getExecutors()).resolves.toEqual([{ userId: 15, fullName: 'Nguyen Van A', executorId: 15 }])
  })

  it('getExecutors_SearchAndVault_SendsTrimmedSearchAndVaultId', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [] } })
    await getExecutors({ search: '  Tran ', vaultId: 4 })
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/executors', { params: { search: 'Tran', vaultId: 4, page: 1, pageSize: 100 } })
  })

  it('getExecutorDetail_WithVault_GetsDetailWithVaultIdParam', async () => {
    axiosClient.get.mockResolvedValue({ data: { userId: 15, fullName: 'Nguyen Van A' } })
    await expect(getExecutorDetail(15, 4)).resolves.toEqual({ userId: 15, fullName: 'Nguyen Van A' })
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/executors/15', { params: { vaultId: 4 } })
  })

  it('assignExecutor_ReadBackFailsButDetailWorks_UsesNameFromDetail', async () => {
    axiosClient.put.mockResolvedValue({ status: 204 })
    axiosClient.get.mockImplementation(async (url) => {
      if (url === '/owner/vaults/3/executor') throw { status: 405 }
      return { data: { userId: 15, fullName: 'Nguyen Van A' } }
    })
    await expect(assignExecutor(3, 15)).resolves.toMatchObject({ vaultId: 3, executorId: 15, fullName: 'Nguyen Van A', status: 'Active' })
  })
})

describe('getNotifications', () => {
  it('getNotifications_PageDto_ReturnsAllItemsFromPagedList', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ notificationId: 2 }, { notificationId: 1 }] } })
    await expect(getNotifications()).resolves.toEqual([{ notificationId: 2 }, { notificationId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/notifications', { params: { page: 1, pageSize: 100 } })
  })
})

describe('notification page and read marker', () => {
  it('getNotificationPage_PageAndSize_GetsOnePageDto', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 2, pageSize: 10, items: [{ notificationId: 3 }] } })
    await expect(getNotificationPage({ page: 2, pageSize: 10 })).resolves.toEqual({ page: 2, pageSize: 10, items: [{ notificationId: 3 }] })
    expect(axiosClient.get).toHaveBeenCalledWith('/notifications', { params: { page: 2, pageSize: 10 } })
  })

  it('getNotificationPage_PlainArray_IsWrappedIntoPageDto', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ notificationId: 1 }] })
    await expect(getNotificationPage({ page: 1, pageSize: 20 })).resolves.toEqual({ page: 1, pageSize: 20, items: [{ notificationId: 1 }] })
  })

  it('markNotificationRead_Id_PostsReadEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await markNotificationRead(5)
    expect(axiosClient.post).toHaveBeenCalledWith('/notifications/5/read')
  })
})

describe('getAssets scoped by vault', () => {
  it('getAssets_WithVaultId_SendsVaultIdFilter', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ assetId: 1 }] })
    await getAssets(4)
    expect(axiosClient.get).toHaveBeenCalledWith('/owner/assets', { params: { vaultId: 4, page: 1, pageSize: 100 } })
  })
})
