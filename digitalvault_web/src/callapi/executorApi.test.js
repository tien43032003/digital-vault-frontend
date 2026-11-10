import axiosClient from './axiosClient'
import {
  acceptHandover,
  completeHandover,
  createHandover,
  declineHandover,
  downloadHandoverDocument,
  getAssignments,
  getHandover,
  getHandovers,
  getLegalVerifiers,
  requestLegalVerification,
  simulateLegalApproval,
  startHandover,
  uploadDeathCertificate,
  uploadEvidence,
} from './executorApi'

vi.mock('./axiosClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

const file = new File(['pdf'], 'ChungTu.pdf', { type: 'application/pdf' })
const signature = new File(['sig'], 'ChungTu.sig')
const sentForm = () => axiosClient.post.mock.calls[0][1]

describe('executorApi', () => {
  afterEach(() => vi.clearAllMocks())

  it('getAssignments_Called_GetsAssignmentsOfTheExecutor', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ vaultId: 1 }] })
    await expect(getAssignments()).resolves.toEqual([{ vaultId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/executor/assignments', { params: { page: 1, pageSize: 100 } })
  })

  it('createHandover_VaultId_PostsToAssignmentHandovers', async () => {
    axiosClient.post.mockResolvedValue({ data: { requestId: 5, status: 'Draft' } })
    await expect(createHandover(3)).resolves.toEqual({ requestId: 5, status: 'Draft' })
    expect(axiosClient.post).toHaveBeenCalledWith('/executor/assignments/3/handovers')
  })

  it('getHandovers_Called_GetsList', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ requestId: 1 }] })
    await expect(getHandovers()).resolves.toEqual([{ requestId: 1 }])
    expect(axiosClient.get).toHaveBeenCalledWith('/executor/handovers', { params: { page: 1, pageSize: 100 } })
  })

  it('getHandover_RequestId_GetsDetail', async () => {
    axiosClient.get.mockResolvedValue({ data: { requestId: 7 } })
    await expect(getHandover(7)).resolves.toEqual({ requestId: 7 })
    expect(axiosClient.get).toHaveBeenCalledWith('/executor/handovers/7')
  })

  it('uploadDeathCertificate_FileOnly_PostsMultipartWithFileAndNoSignature', async () => {
    axiosClient.post.mockResolvedValue({ data: { documentId: 3 } })
    await expect(uploadDeathCertificate(7, { file })).resolves.toEqual({ documentId: 3 })
    expect(axiosClient.post.mock.calls[0][0]).toBe('/executor/handovers/7/death-certificate')
    expect([...sentForm().keys()]).toEqual(['File'])
  })

  it('uploadDeathCertificate_WithSignature_AddsSignatureField', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await uploadDeathCertificate(7, { file, signature })
    expect([...sentForm().keys()].sort()).toEqual(['File', 'Signature'])
  })

  it('uploadEvidence_File_PostsToDocumentsEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await uploadEvidence(7, { file, signature })
    expect(axiosClient.post.mock.calls[0][0]).toBe('/executor/handovers/7/documents')
    expect(sentForm().get('Signature').name).toBe('ChungTu.sig')
  })

  it('requestLegalVerification_Values_PostsVerifierCommentAndEvidence', async () => {
    axiosClient.post.mockResolvedValue({ data: { verificationId: 4 } })
    await expect(requestLegalVerification(7, { verifierId: '6', comment: ' Hồ sơ đủ ', evidence: file })).resolves.toEqual({ verificationId: 4 })
    expect(axiosClient.post.mock.calls[0][0]).toBe('/executor/handovers/7/legal-verifications')
    const form = sentForm()
    expect(form.get('VerifierId')).toBe('6')
    expect(form.get('Comment')).toBe('Hồ sơ đủ')
    expect(form.get('Evidence').name).toBe('ChungTu.pdf')
  })

  it('requestLegalVerification_WithSignature_PostsSignatureField', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    const signature = new File([new Uint8Array(64)], 'BangChung.sig')
    await requestLegalVerification(7, { verifierId: 6, evidence: file, signature })
    expect(sentForm().get('Signature').name).toBe('BangChung.sig')
  })

  it('requestLegalVerification_BlankComment_OmitsComment', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await requestLegalVerification(7, { verifierId: 6, comment: '   ', evidence: file })
    expect(sentForm().has('Comment')).toBe(false)
  })

  it('startHandover_RequestId_PostsStart', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await startHandover(7)
    expect(axiosClient.post).toHaveBeenCalledWith('/executor/handovers/7/start')
  })

  it('completeHandover_FileAndSignature_PostsMultipart', async () => {
    axiosClient.post.mockResolvedValue({ status: 204 })
    await completeHandover(7, { file, signature })
    expect(axiosClient.post.mock.calls[0][0]).toBe('/executor/handovers/7/complete')
    expect([...sentForm().keys()].sort()).toEqual(['File', 'Signature'])
  })

  it('downloadHandoverDocument_Ids_ReturnsBlobAndSignatureFlag', async () => {
    const blob = new Blob(['x'])
    axiosClient.get.mockResolvedValue({ data: blob, headers: { 'x-signature-valid': 'true' } })
    await expect(downloadHandoverDocument(7, 3)).resolves.toEqual({ blob, signatureValid: true })
    expect(axiosClient.get).toHaveBeenCalledWith('/executor/handovers/7/documents/3/content', { responseType: 'blob' })
  })

  it('downloadHandoverDocument_FalseHeader_ReportsInvalidSignature', async () => {
    axiosClient.get.mockResolvedValue({ data: new Blob(['x']), headers: { 'x-signature-valid': 'false' } })
    expect((await downloadHandoverDocument(7, 3)).signatureValid).toBe(false)
  })

  it('simulateLegalApproval_RequestId_PostsMockEndpoint', async () => {
    axiosClient.post.mockResolvedValue({ data: { status: 'Approved' } })
    await expect(simulateLegalApproval(7)).resolves.toEqual({ status: 'Approved' })
    expect(axiosClient.post).toHaveBeenCalledWith('/executor/handovers/7/simulate-approval')
  })
})

describe('executor list endpoints returning PageDto like the deployed backend', () => {
  it('getAssignments_PageDto_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ vaultId: 1 }] } })
    await expect(getAssignments()).resolves.toEqual([{ vaultId: 1 }])
  })

  it('getHandovers_PageDto_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 100, items: [{ requestId: 3 }] } })
    await expect(getHandovers()).resolves.toEqual([{ requestId: 3 }])
  })
})

describe('getLegalVerifiers', () => {
  it('getLegalVerifiers_RequestId_GetsEligibleVerifiersOfThatRequest', async () => {
    axiosClient.get.mockResolvedValue({ data: [{ userId: 6, fullName: 'CCV' }] })
    await expect(getLegalVerifiers(9)).resolves.toEqual([{ userId: 6, fullName: 'CCV' }])
    expect(axiosClient.get).toHaveBeenCalledWith('/executor/handovers/9/legal-verifiers')
  })

  it('getLegalVerifiers_PageDtoShape_ReturnsItems', async () => {
    axiosClient.get.mockResolvedValue({ data: { page: 1, pageSize: 20, items: [{ userId: 6 }] } })
    await expect(getLegalVerifiers(9)).resolves.toEqual([{ userId: 6 }])
  })
})

describe('intake decision', () => {
  it('acceptHandover_RequestId_PostsAcceptWithoutBody', async () => {
    axiosClient.post.mockResolvedValue({ data: { requestId: 5, status: 'Draft' } })
    await expect(acceptHandover(5)).resolves.toEqual({ requestId: 5, status: 'Draft' })
    expect(axiosClient.post).toHaveBeenCalledWith('/executor/handovers/5/accept')
  })

  it('declineHandover_Reason_PostsTrimmedReason', async () => {
    axiosClient.post.mockResolvedValue({ data: { requestId: 5, status: 'Declined' } })
    await expect(declineHandover(5, '  Bận  ')).resolves.toEqual({ requestId: 5, status: 'Declined' })
    expect(axiosClient.post).toHaveBeenCalledWith('/executor/handovers/5/decline', { reason: 'Bận' })
  })
})
