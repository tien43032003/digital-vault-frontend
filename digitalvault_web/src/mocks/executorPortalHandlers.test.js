// @vitest-environment node
// Chạy trong môi trường Node: jsdom làm File bị gửi thành chuỗi nên không test được multipart thật qua XHR của jsdom
import { setupServer } from 'msw/node'
import axiosClient from '../callapi/axiosClient'
import {
  completeHandover,
  createHandover,
  downloadHandoverDocument,
  getAssignments,
  getHandover,
  getHandovers,
  requestLegalVerification,
  simulateLegalApproval,
  startHandover,
  uploadDeathCertificate,
  uploadEvidence,
} from '../callapi/executorApi'
import { DEMO_ACCOUNT, ROLE_ACCOUNTS, getDb, resetMockDb } from './db'
import { handlers } from './handlers'

// Node không có sessionStorage/localStorage, mock cần chúng để giữ phiên đăng nhập giả
function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  }
}
globalThis.sessionStorage = memoryStorage()
globalThis.localStorage = memoryStorage()
// Axios trong Node cần URL tuyệt đối
axiosClient.defaults.baseURL = 'http://localhost/api'

const server = setupServer(...handlers)

const EXECUTOR = ROLE_ACCOUNTS.find((account) => account.role === 'Executor')
const VERIFIER = ROLE_ACCOUNTS.find((account) => account.role === 'LegalVerifier')
const loginAs = (account) => axiosClient.post('/auth/login', { email: account.email, password: account.password })

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  resetMockDb()
  await loginAs(EXECUTOR)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const pdf = (name = 'ChungTu.pdf') => new File(['%PDF-1.4 demo'], name, { type: 'application/pdf' })
const sig = () => new File([new Uint8Array(256)], 'ChungTu.sig')

async function attempt(action) {
  try {
    return { ok: true, data: await action() }
  } catch (error) {
    return { ok: false, status: error.status, message: error.message }
  }
}

// Đưa hồ sơ tới trạng thái Pending_Legal (đã có giấy chứng tử và đã gửi thẩm định)
async function submitted() {
  const request = await createHandover(1)
  await uploadDeathCertificate(request.requestId, { file: pdf() })
  await requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, comment: 'Hồ sơ đầy đủ', evidence: pdf('BangChung.pdf') })
  return request.requestId
}

describe('mock executor assignments', () => {
  it('get_Executor_ReturnsOwnActiveAssignments', async () => {
    const list = await getAssignments()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ vaultId: 1, executorId: EXECUTOR.userId, status: 'Active' })
    expect(Object.keys(list[0]).sort()).toEqual(['assignedAt', 'executorId', 'status', 'vaultId'])
  })

  it('get_AfterOwnerChangesExecutor_NoLongerListsTheVault', async () => {
    getDb().executorAssignments[1].executorId = 22
    expect(await getAssignments()).toEqual([])
  })

  it('get_OwnerRole_Returns403', async () => {
    await loginAs(DEMO_ACCOUNT)
    expect((await attempt(getAssignments)).status).toBe(403)
  })
})

describe('mock create handover', () => {
  it('post_AssignedVault_ReturnsDraftHandoverWithCasesPerActiveAllocation', async () => {
    const request = await createHandover(1)
    expect(request).toMatchObject({ vaultId: 1, requestType: 'Inheritance', status: 'Draft', documents: [] })
    expect(typeof request.requestId).toBe('number')
    expect(request.cases).toHaveLength(6)
    expect(request.cases[0]).toMatchObject({ status: 'Pending' })
    expect(Object.keys(request.cases[0]).sort()).toEqual(['assetId', 'beneficiaryId', 'handoverId', 'status'])
  })

  it('post_SecondTimeWhileOneIsOpen_Returns409', async () => {
    await createHandover(1)
    expect((await attempt(() => createHandover(1))).status).toBe(409)
  })

  it('post_VaultNotAssignedToThisExecutor_Returns403', async () => {
    expect((await attempt(() => createHandover(2))).status).toBe(403)
  })

  it('post_OwnerRole_Returns403', async () => {
    await loginAs(DEMO_ACCOUNT)
    expect((await attempt(() => createHandover(1))).status).toBe(403)
  })
})

describe('mock handover list and detail', () => {
  it('get_ListStartsEmptyThenShowsCreatedHandover', async () => {
    expect(await getHandovers()).toEqual([])
    const request = await createHandover(1)
    expect((await getHandovers()).map((item) => item.requestId)).toEqual([request.requestId])
  })

  it('get_Detail_ReturnsTheHandover', async () => {
    const request = await createHandover(1)
    expect((await getHandover(request.requestId)).status).toBe('Draft')
  })

  it('get_UnknownDetail_Returns404', async () => {
    expect((await attempt(() => getHandover(999))).status).toBe(404)
  })

  it('get_HandoverOfAnotherExecutor_Returns404', async () => {
    const request = await createHandover(1)
    getDb().handovers[0].executorId = 22
    expect((await attempt(() => getHandover(request.requestId))).status).toBe(404)
  })
})

describe('mock death certificate and evidence', () => {
  it('post_DeathCertificate_ReturnsDocumentDtoAndAppearsOnHandover', async () => {
    const request = await createHandover(1)
    const document = await uploadDeathCertificate(request.requestId, { file: pdf('GiayChungTu.pdf') })
    expect(document).toMatchObject({ fileName: 'GiayChungTu.pdf', fileType: 'application/pdf', isEncrypted: true })
    expect((await getHandover(request.requestId)).documents.map((d) => d.fileName)).toEqual(['GiayChungTu.pdf'])
  })

  it('post_Evidence_IsAcceptedWithOptionalSignature', async () => {
    const request = await createHandover(1)
    const document = await uploadEvidence(request.requestId, { file: pdf('BangChung.pdf'), signature: sig() })
    expect(document.fileName).toBe('BangChung.pdf')
  })

  it('post_UnsupportedFileType_Returns400', async () => {
    const request = await createHandover(1)
    const exe = new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' })
    expect((await attempt(() => uploadDeathCertificate(request.requestId, { file: exe }))).status).toBe(400)
  })

  it('post_SignatureOverSixteenKilobytes_Returns400', async () => {
    const request = await createHandover(1)
    const big = new File([new Uint8Array(16385)], 'big.sig')
    expect((await attempt(() => uploadEvidence(request.requestId, { file: pdf(), signature: big }))).status).toBe(400)
  })

  it('post_UnknownField_Returns400', async () => {
    const request = await createHandover(1)
    const form = new FormData()
    form.append('File', pdf())
    form.append('Purpose', 'DeathCertificate')
    const rejected = await axiosClient.post(`/executor/handovers/${request.requestId}/documents`, form).catch((error) => error)
    expect(rejected.status).toBe(400)
  })

  it('post_AfterSubmittedForLegalReview_Returns409', async () => {
    const requestId = await submitted()
    expect((await attempt(() => uploadEvidence(requestId, { file: pdf() }))).status).toBe(409)
  })

  it('post_UnknownHandover_Returns404', async () => {
    expect((await attempt(() => uploadDeathCertificate(999, { file: pdf() }))).status).toBe(404)
  })
})

describe('mock legal verification request', () => {
  it('post_WithoutDeathCertificate_IsAllowedAndMovesToPendingLegal', async () => {
    const request = await createHandover(1)
    const result = await attempt(() => requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, evidence: pdf(), signature: sig() }))
    expect(result.ok).toBe(true)
    expect((await getHandover(request.requestId)).status).toBe('Pending_Legal')
  })

  it('post_WithDeathCertificate_ReturnsVerificationIdAndMovesToPendingLegal', async () => {
    const request = await createHandover(1)
    await uploadDeathCertificate(request.requestId, { file: pdf() })
    const result = await requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, comment: 'ok', evidence: pdf('BangChung.pdf') })
    expect(typeof result.verificationId).toBe('number')
    expect((await getHandover(request.requestId)).status).toBe('Pending_Legal')
  })

  it('post_EvidenceWithSignature_IsAccepted', async () => {
    const request = await createHandover(1)
    await uploadDeathCertificate(request.requestId, { file: pdf() })
    const result = await requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, evidence: pdf('BangChung.pdf'), signature: sig() })
    expect(typeof result.verificationId).toBe('number')
  })

  it('post_EvidenceSignatureTooLarge_Returns400', async () => {
    const request = await createHandover(1)
    await uploadDeathCertificate(request.requestId, { file: pdf() })
    const big = new File([new Uint8Array(16385)], 'big.sig')
    const result = await attempt(() => requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, evidence: pdf('BangChung.pdf'), signature: big }))
    expect(result.status).toBe(400)
  })

  it('post_SubmittingTwice_Returns409', async () => {
    const requestId = await submitted()
    const result = await attempt(() => requestLegalVerification(requestId, { verifierId: VERIFIER.userId, evidence: pdf() }))
    expect(result.status).toBe(409)
  })

  it.each([[999], [EXECUTOR.userId], [DEMO_ACCOUNT.userId]])('post_VerifierIsNotAnIndependentLegalVerifier_Returns400', async (verifierId) => {
    const request = await createHandover(1)
    await uploadDeathCertificate(request.requestId, { file: pdf() })
    expect((await attempt(() => requestLegalVerification(request.requestId, { verifierId, evidence: pdf() }))).status).toBe(400)
  })

  it('post_CommentOver2000Characters_Returns400', async () => {
    const request = await createHandover(1)
    await uploadDeathCertificate(request.requestId, { file: pdf() })
    const result = await attempt(() => requestLegalVerification(request.requestId, { verifierId: VERIFIER.userId, comment: 'x'.repeat(2001), evidence: pdf() }))
    expect(result.status).toBe(400)
  })
})

describe('mock approval simulation, start and complete', () => {
  it('simulateApproval_PendingLegal_BecomesApproved', async () => {
    const requestId = await submitted()
    expect((await simulateLegalApproval(requestId)).status).toBe('Approved')
    expect((await getHandover(requestId)).status).toBe('Approved')
  })

  it('simulateApproval_DraftHandover_Returns409', async () => {
    const request = await createHandover(1)
    expect((await attempt(() => simulateLegalApproval(request.requestId))).status).toBe(409)
  })

  it('start_Approved_MovesToInProgress', async () => {
    const requestId = await submitted()
    await simulateLegalApproval(requestId)
    await startHandover(requestId)
    expect((await getHandover(requestId)).status).toBe('In_Progress')
  })

  it('start_NotApproved_Returns409', async () => {
    const request = await createHandover(1)
    expect((await attempt(() => startHandover(request.requestId))).status).toBe(409)
  })

  it('complete_InProgressWithFileAndSignature_MovesToCompleted', async () => {
    const requestId = await submitted()
    await simulateLegalApproval(requestId)
    await startHandover(requestId)
    await completeHandover(requestId, { file: pdf('BienBan.pdf'), signature: sig() })
    expect((await getHandover(requestId)).status).toBe('Completed')
  })

  it('complete_WithoutSignature_Returns400', async () => {
    const requestId = await submitted()
    await simulateLegalApproval(requestId)
    await startHandover(requestId)
    expect((await attempt(() => completeHandover(requestId, { file: pdf() }))).status).toBe(400)
  })

  it('complete_DraftHandover_Returns409', async () => {
    const request = await createHandover(1)
    expect((await attempt(() => completeHandover(request.requestId, { file: pdf(), signature: sig() }))).status).toBe(409)
  })

  it('complete_UnknownHandover_Returns404', async () => {
    expect((await attempt(() => completeHandover(999, { file: pdf(), signature: sig() }))).status).toBe(404)
  })
})

describe('mock handover document content', () => {
  it('get_Document_ReturnsPlaceholderWithSignatureHeader', async () => {
    const request = await createHandover(1)
    const document = await uploadDeathCertificate(request.requestId, { file: pdf('GiayChungTu.pdf'), signature: sig() })
    const { blob, signatureValid } = await downloadHandoverDocument(request.requestId, document.documentId)
    expect(signatureValid).toBe(true)
    // Axios trong Node trả chuỗi thay vì Blob cho responseType blob
    const text = typeof blob.text === 'function' ? await blob.text() : String(blob)
    expect(text).toContain('GiayChungTu.pdf')
  })

  it('get_DocumentWithoutSignature_ReportsSignatureNotValid', async () => {
    const request = await createHandover(1)
    const document = await uploadEvidence(request.requestId, { file: pdf('BangChung.pdf') })
    expect((await downloadHandoverDocument(request.requestId, document.documentId)).signatureValid).toBe(false)
  })

  it('get_UnknownDocument_Returns404', async () => {
    const request = await createHandover(1)
    expect((await attempt(() => downloadHandoverDocument(request.requestId, 9999))).status).toBe(404)
  })
})
