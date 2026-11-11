import { beforeEach, describe, expect, it, vi } from 'vitest'
import axiosClient from './axiosClient'
import { approveLegalHandover, getLegalAssets, getLegalHandover, getLegalHandoversByStatuses, getLegalHistory, rejectLegalHandover, requestAdditionalInfoLegalHandover } from './legalApi'

vi.mock('./axiosClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const wrapped = { request: { requestId: 2, vaultId: 9, status: 'Pending_Legal', documents: [{ documentId: 8 }] }, verification: { verificationId: 1 } }
const history = [
  { verificationId: 1, requestId: 2, verifierName: 'A', status: 'Additional_Info', submittedAt: '2026-10-23T14:00:00', reviewedAt: '2026-10-23T15:00:00', comment: 'thiếu giấy' },
  { verificationId: 2, requestId: 2, verifierName: 'A', status: 'Pending', submittedAt: '2026-10-24T09:00:00', reviewedAt: null, comment: null },
]
const ownerStatus = { ownerId: 5, fullName: 'Phạm Nhật Tiến', status: 'Triggered', deathCertificateDocumentId: 8 }
const assets = [{ assetId: 27, name: 'Ví crypto', type: 'CryptoWallet', status: 'Active', documents: [{ documentId: 11, fileName: 'a.pdf' }] }]

describe('legalApi', () => {
  beforeEach(() => vi.resetAllMocks())

  it('getLegalHandoversByStatuses_ManyStatuses_MergesDedupesAndSortsNewestFirst', async () => {
    const byStatus = {
      Approved: [{ requestId: 1, status: 'Approved', initiatedAt: '2026-10-01T00:00:00' }],
      In_Progress: [{ requestId: 2, status: 'In_Progress', initiatedAt: '2026-10-03T00:00:00' }],
      Completed: [{ requestId: 3, status: 'Completed', initiatedAt: '2026-10-02T00:00:00' }, { requestId: 2, status: 'In_Progress', initiatedAt: '2026-10-03T00:00:00' }],
    }
    axiosClient.get.mockImplementation(async (_url, { params }) => ({ data: { page: 1, pageSize: 100, items: byStatus[params.status] } }))
    const result = await getLegalHandoversByStatuses({ page: 1, pageSize: 20, statuses: ['Approved', 'In_Progress', 'Completed'] })
    expect(result.items.map((item) => item.requestId)).toEqual([2, 3, 1])
  })

  it('getLegalHandoversByStatuses_Paging_SlicesMergedList', async () => {
    const items = [1, 2, 3].map((requestId) => ({ requestId, initiatedAt: `2026-10-0${requestId}T00:00:00` }))
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items } })
    const result = await getLegalHandoversByStatuses({ page: 2, pageSize: 2, statuses: ['Approved'] })
    expect(result.items.map((item) => item.requestId)).toEqual([1])
  })

  it('getLegalHandoversByStatuses_OneStatusFails_StillReturnsTheOthers', async () => {
    axiosClient.get.mockImplementation(async (_url, { params }) => {
      if (params.status === 'Completed') throw new Error('boom')
      return { data: { page: 1, pageSize: 100, items: [{ requestId: 5, initiatedAt: '2026-10-01T00:00:00' }] } }
    })
    const result = await getLegalHandoversByStatuses({ statuses: ['Approved', 'Completed'] })
    expect(result.items).toHaveLength(1)
  })

  it('getLegalHandoversByStatuses_AllFail_Throws', async () => {
    axiosClient.get.mockRejectedValue(new Error('boom'))
    await expect(getLegalHandoversByStatuses({ statuses: ['Approved', 'Completed'] })).rejects.toThrow('boom')
  })

  const decisionFiles = () => ({ file: new File(['quyết định'], 'qd.pdf', { type: 'application/pdf' }), signature: new File(['sig'], 'qd.sig') })

  it.each([
    ['approveLegalHandover', approveLegalHandover, 'approve'],
    ['rejectLegalHandover', rejectLegalHandover, 'reject'],
  ])('%s_Input_PostsMultipartWithFileSignatureAndTrimmedComment', async (_name, call, path) => {
    axiosClient.post.mockResolvedValue({ data: { verificationId: 1, status: 'Done' } })
    const { file, signature } = decisionFiles()
    await expect(call(7, { comment: '  đủ căn cứ  ', file, signature })).resolves.toEqual({ verificationId: 1, status: 'Done' })
    const [url, form, config] = axiosClient.post.mock.calls[0]
    expect(url).toBe(`/legal/handovers/7/${path}`)
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('File')).toBe(file)
    expect(form.get('Signature')).toBe(signature)
    expect(form.get('Comment')).toBe('đủ căn cứ')
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
  })

  it('requestAdditionalInfoLegalHandover_Comment_StillPostsJson', async () => {
    axiosClient.post.mockResolvedValue({ data: { status: 'Additional_Info' } })
    await requestAdditionalInfoLegalHandover(7, { comment: ' thiếu giấy ' })
    expect(axiosClient.post).toHaveBeenCalledWith('/legal/handovers/7/request-additional-information', { comment: 'thiếu giấy' })
  })

  it('getLegalHandover_WrappedResponse_FlattensRequestAndAddsOwnerAssetsWithDocuments', async () => {
    axiosClient.get.mockImplementation(async (url) => ({ data: url.endsWith('/assets') ? { page: 1, pageSize: 100, items: assets } : url.endsWith('/history') ? [] : url.endsWith('/owner-status') ? ownerStatus : wrapped }))
    await expect(getLegalHandover(2)).resolves.toEqual({
      requestId: 2,
      vaultId: 9,
      status: 'Pending_Legal',
      documents: [{ documentId: 8 }],
      verification: { verificationId: 1 },
      assets,
      history: [],
      ownerStatus,
    })
    expect(axiosClient.get).toHaveBeenCalledWith('/legal/handovers/2')
    expect(axiosClient.get).toHaveBeenCalledWith('/legal/handovers/2/assets', { params: { page: 1, pageSize: 100 } })
  })

  it('getLegalHandover_AssetsRequestFails_StillReturnsHandoverWithNoAssets', async () => {
    axiosClient.get.mockImplementation(async (url) => {
      if (url.endsWith('/assets')) throw new Error('boom')
      return { data: wrapped }
    })
    await expect(getLegalHandover(2)).resolves.toMatchObject({ requestId: 2, assets: [] })
  })

  it('getLegalHandover_OwnerStatusRequestFails_StillReturnsHandoverWithNullOwnerStatus', async () => {
    axiosClient.get.mockImplementation(async (url) => {
      if (url.endsWith('/owner-status')) throw new Error('boom')
      return { data: url.endsWith('/assets') ? { items: [] } : url.endsWith('/history') ? [] : wrapped }
    })
    await expect(getLegalHandover(2)).resolves.toMatchObject({ requestId: 2, ownerStatus: null })
  })

  it('getLegalHandover_HistoryRequestFails_StillReturnsHandoverWithEmptyHistory', async () => {
    axiosClient.get.mockImplementation(async (url) => {
      if (url.endsWith('/history')) throw new Error('boom')
      return { data: url.endsWith('/assets') ? { items: [] } : wrapped }
    })
    await expect(getLegalHandover(2)).resolves.toMatchObject({ requestId: 2, history: [] })
  })

  it('getLegalHistory_Entries_AreSortedNewestFirst', async () => {
    axiosClient.get.mockResolvedValue({ data: history })
    const result = await getLegalHistory(2)
    expect(result.map((entry) => entry.verificationId)).toEqual([2, 1])
    expect(axiosClient.get).toHaveBeenCalledWith('/legal/handovers/2/history')
  })

  it('getLegalHandover_FlatResponse_ReturnsAsIs', async () => {
    axiosClient.get.mockResolvedValue({ data: { requestId: 3, status: 'Approved' } })
    await expect(getLegalHandover(3)).resolves.toEqual({ requestId: 3, status: 'Approved' })
    expect(axiosClient.get).toHaveBeenCalledTimes(1)
  })

  it('getLegalAssets_PageDto_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: assets } })
    await expect(getLegalAssets(5)).resolves.toEqual(assets)
  })
})
