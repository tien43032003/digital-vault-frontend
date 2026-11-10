import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { login } from '../../callapi/authApi'
import { ApiError } from '../../callapi/axiosClient'
import { completeHandover, createHandover, requestLegalVerification, uploadDeathCertificate, uploadEvidence } from '../../callapi/executorApi'
import { ROLE_ACCOUNTS, getDb, resetMockDb } from '../../mocks/db'
import { handlers } from '../../mocks/handlers'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExecutorHandoverDetailPage from './ExecutorHandoverDetailPage'

// Multipart không test được qua XHR của jsdom (File bị gửi thành chuỗi), nên thay các hàm gửi file;
// các endpoint mock tương ứng đã được test ở mocks/executorPortalHandlers.test.js trong môi trường Node
vi.mock('../../callapi/executorApi', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadDeathCertificate: vi.fn(),
  uploadEvidence: vi.fn(),
  requestLegalVerification: vi.fn(),
  completeHandover: vi.fn(),
}))

const server = setupServer(...handlers)
const EXECUTOR = ROLE_ACCOUNTS.find((account) => account.role === 'Executor')

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  vi.mocked(uploadDeathCertificate).mockReset()
  vi.mocked(uploadEvidence).mockReset()
  vi.mocked(requestLegalVerification).mockReset()
  vi.mocked(completeHandover).mockReset()
  resetMockDb()
  await login(EXECUTOR.email, EXECUTOR.password)
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// applyAccept: false để thử được cả file sai định dạng (thuộc tính accept chỉ là gợi ý cho trình duyệt)
const setupUser = () => userEvent.setup({ applyAccept: false })

async function openDetail(status = 'Draft') {
  const request = await createHandover(1)
  getDb().handovers[0].status = status
  renderWithProviders(<ExecutorHandoverDetailPage mockMode="full" />, {
    route: `/executor/handovers/${request.requestId}`,
    path: '/executor/handovers/:requestId',
  })
  await screen.findByRole('heading', { level: 1, name: /^HS-/ })
  return request.requestId
}

const region = (name) => screen.getByRole('region', { name })
const pdf = (name = 'GiayChungTu.pdf') => new File(['%PDF-1.4 demo'], name, { type: 'application/pdf' })
const sig = (name = 'ChungTu.sig') => new File([new Uint8Array(256)], name)

// Giả lập BE đã nhận file: thêm giấy tờ vào hồ sơ mock để lần tải lại thấy file mới
function fakeUploadInto(mockFn, purpose) {
  mockFn.mockImplementation(async (_requestId, input) => {
    const document = { documentId: 77, fileName: input.file.name, fileType: input.file.type, purpose, hasSignature: Boolean(input.signature) }
    getDb().handovers[0].documents.push(document)
    return { documentId: 77, fileName: document.fileName, fileType: document.fileType, isEncrypted: true, signatureValid: null }
  })
}

describe('death certificate form', () => {
  it('submit_NothingSelected_ShowsRequiredErrorAndDoesNotUpload', async () => {
    const user = setupUser()
    await openDetail()
    await user.click(within(region('Nộp giấy chứng tử')).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    expect(within(region('Nộp giấy chứng tử')).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(uploadDeathCertificate).not.toHaveBeenCalled()
  })

  it('submit_UnsupportedType_ShowsTypeError', async () => {
    const user = setupUser()
    await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }))
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    expect(within(form).getByText('Chỉ hỗ trợ PDF, PNG, JPEG hoặc văn bản (.txt).')).toBeInTheDocument()
  })

  it('submit_SignatureTooBig_ShowsSignatureError', async () => {
    const user = setupUser()
    await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), pdf())
    await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), new File([new Uint8Array(16385)], 'big.sig'))
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    expect(within(form).getByText('File chữ ký phải từ 1 byte đến 16 KB.')).toBeInTheDocument()
  })

  it('submit_FileOnly_UploadsWithoutSignatureAndListsTheDocument', async () => {
    fakeUploadInto(uploadDeathCertificate, 'DeathCertificate')
    const user = setupUser()
    const id = await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), pdf('GiayChungTu.pdf'))
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    expect(await screen.findByText('Đã nộp giấy chứng tử')).toBeInTheDocument()
    const [requestId, input] = uploadDeathCertificate.mock.calls[0]
    expect(requestId).toBe(id)
    expect(input.file.name).toBe('GiayChungTu.pdf')
    expect(input.signature).toBeNull()
    const list = await screen.findByRole('list', { name: 'Giấy tờ của hồ sơ' })
    expect(within(list).getByText('GiayChungTu.pdf')).toBeInTheDocument()
  })

  it('submit_WithSignature_SendsSignatureToo', async () => {
    fakeUploadInto(uploadDeathCertificate, 'DeathCertificate')
    const user = setupUser()
    await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), pdf())
    await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), sig('GiayChungTu.sig'))
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    await waitFor(() => expect(uploadDeathCertificate).toHaveBeenCalled())
    expect(uploadDeathCertificate.mock.calls[0][1].signature.name).toBe('GiayChungTu.sig')
  })

  it('submit_ServerRejectsFile_ShowsMessageWithServerDetail', async () => {
    uploadDeathCertificate.mockRejectedValue(new ApiError(400, 'File content does not match MIME type.'))
    const user = setupUser()
    await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), pdf())
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('Tệp hoặc chữ ký không hợp lệ')
    expect(alert).toHaveTextContent('File content does not match MIME type.')
  })

  it('submit_HandoverNotEditableAnymore409_ExplainsWhy', async () => {
    uploadDeathCertificate.mockRejectedValue(new ApiError(409, 'x'))
    const user = setupUser()
    await openDetail()
    const form = region('Nộp giấy chứng tử')
    await user.upload(within(form).getByLabelText(/^Giấy chứng tử/), pdf())
    await user.click(within(form).getByRole('button', { name: 'Nộp giấy chứng tử' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Hồ sơ không còn ở trạng thái cho phép nộp thêm giấy tờ.')
  })
})

describe('evidence form', () => {
  it('submit_File_UploadsEvidenceAndShowsToast', async () => {
    fakeUploadInto(uploadEvidence, 'Evidence')
    const user = setupUser()
    await openDetail()
    const form = region('Nộp bằng chứng bổ sung')
    await user.upload(within(form).getByLabelText(/^Tệp bằng chứng/), pdf('BangChung.pdf'))
    await user.click(within(form).getByRole('button', { name: 'Nộp bằng chứng' }))
    expect(await screen.findByText('Đã nộp bằng chứng')).toBeInTheDocument()
    expect(uploadEvidence.mock.calls[0][1].file.name).toBe('BangChung.pdf')
  })

  it('submit_NothingSelected_ShowsRequiredError', async () => {
    const user = setupUser()
    await openDetail()
    const form = region('Nộp bằng chứng bổ sung')
    await user.click(within(form).getByRole('button', { name: 'Nộp bằng chứng' }))
    expect(within(form).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
  })
})

describe('legal verification form', () => {
  const verifierSelect = async (form) => {
    const select = await within(form).findByLabelText(/^Người xác minh pháp lý/)
    await within(select).findByRole('option', { name: 'CCV. Nguyễn Văn Cường' })
    return select
  }

  const fill = async (user, { verifier = '6', comment = '', evidence = pdf('BangChung.pdf'), signature = sig('BangChung.sig') } = {}) => {
    const form = region('Gửi thẩm định pháp lý')
    if (verifier) await user.selectOptions(await verifierSelect(form), verifier)
    if (comment) await user.type(within(form).getByLabelText(/^Ghi chú/), comment)
    if (evidence) await user.upload(within(form).getByLabelText(/^Bằng chứng gửi kèm/), evidence)
    if (signature) await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), signature)
    await user.click(within(form).getByRole('button', { name: 'Gửi thẩm định' }))
    return form
  }

  it('verifierList_Loaded_ShowsOnlyEligibleVerifiersFromApi', async () => {
    await openDetail()
    const form = region('Gửi thẩm định pháp lý')
    const select = await within(form).findByLabelText(/^Người xác minh pháp lý/)
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2))
    expect(within(select).getByRole('option', { name: 'CCV. Nguyễn Văn Cường' })).toHaveValue('6')
  })

  it('verifierList_ApiFails_ShowsErrorAndRetryReloadsList', async () => {
    server.use(http.get('*/api/executor/handovers/:requestId/legal-verifiers', () => HttpResponse.json({ status: 500, detail: 'x' }, { status: 500 })))
    const user = setupUser()
    await openDetail()
    const form = region('Gửi thẩm định pháp lý')
    expect(await within(form).findByRole('alert')).toHaveTextContent('Không tải được danh sách người xác minh')
    server.resetHandlers()
    await user.click(within(form).getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(within(within(form).getByLabelText(/^Người xác minh pháp lý/)).getAllByRole('option')).toHaveLength(2))
  })

  it('verifierList_Empty_ShowsMessageAndDisablesSubmit', async () => {
    server.use(http.get('*/api/executor/handovers/:requestId/legal-verifiers', () => HttpResponse.json([])))
    await openDetail()
    const form = region('Gửi thẩm định pháp lý')
    expect(await within(form).findByText(/chưa có người xác minh pháp lý phù hợp/)).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Gửi thẩm định' })).toBeDisabled()
  })

  it('submit_Empty_ShowsRequiredErrorsAndDoesNotCallApi', async () => {
    const user = setupUser()
    await openDetail()
    const form = await fill(user, { verifier: '', evidence: null, signature: null })
    expect(within(form).getByText('Vui lòng chọn người xác minh pháp lý.')).toBeInTheDocument()
    expect(within(form).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(within(form).getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(requestLegalVerification).not.toHaveBeenCalled()
  })

  it('submit_EvidenceWithoutSignature_ShowsSignatureRequiredAndDoesNotCallApi', async () => {
    const user = setupUser()
    await openDetail()
    const form = await fill(user, { signature: null })
    expect(within(form).getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(requestLegalVerification).not.toHaveBeenCalled()
  })

  it('submit_CommentOver2000_ShowsError', async () => {
    const user = setupUser()
    await openDetail()
    const form = region('Gửi thẩm định pháp lý')
    await user.selectOptions(await verifierSelect(form), '6')
    await user.upload(within(form).getByLabelText(/^Bằng chứng gửi kèm/), pdf())
    await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), sig())
    fireTypeLong(within(form).getByLabelText(/^Ghi chú/), 'x'.repeat(2001))
    await user.click(within(form).getByRole('button', { name: 'Gửi thẩm định' }))
    expect(within(form).getByText('Ghi chú tối đa 2000 ký tự.')).toBeInTheDocument()
  })

  it('submit_Valid_SendsAndMovesHandoverToPendingLegal', async () => {
    requestLegalVerification.mockImplementation(async () => {
      getDb().handovers[0].status = 'Pending_Legal'
      return { verificationId: 4 }
    })
    const user = setupUser()
    const id = await openDetail()
    await fill(user, { comment: 'Hồ sơ đầy đủ' })
    expect(await screen.findByText('Đã gửi hồ sơ thẩm định')).toBeInTheDocument()
    const [requestId, input] = requestLegalVerification.mock.calls[0]
    expect(requestId).toBe(id)
    expect(input).toMatchObject({ verifierId: 6, comment: 'Hồ sơ đầy đủ' })
    expect(input.evidence.name).toBe('BangChung.pdf')
    expect(input.signature.name).toBe('BangChung.sig')
    expect(await screen.findByText('Chờ thẩm định pháp lý')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gửi thẩm định pháp lý' })).not.toBeInTheDocument()
  })

  it('submit_Server400_ExplainsWhatToCheckWithoutRequiringDeathCertificate', async () => {
    requestLegalVerification.mockRejectedValue(new ApiError(400, 'An independent legal verifier is required.'))
    const user = setupUser()
    await openDetail()
    const form = await fill(user)
    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('bằng chứng và chữ ký hợp lệ')
    expect(alert).not.toHaveTextContent('đã nộp giấy chứng tử')
    expect(alert).toHaveTextContent('An independent legal verifier is required.')
  })

  it('forms_DeathCertificateIsOptional_ShownAsNotRequired', async () => {
    await openDetail()
    expect(region('Nộp giấy chứng tử')).toHaveTextContent('Không bắt buộc')
    expect(region('Gửi thẩm định pháp lý')).toHaveTextContent('Giấy chứng tử không bắt buộc')
    expect(region('Gửi thẩm định pháp lý')).not.toHaveTextContent('Cần nộp giấy chứng tử trước')
  })
})

describe('completion form', () => {
  it('submit_Empty_ShowsRequiredErrors', async () => {
    const user = setupUser()
    await openDetail('In_Progress')
    const form = region('Hoàn tất bàn giao')
    await user.click(within(form).getByRole('button', { name: 'Hoàn tất bàn giao' }))
    expect(within(form).getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(within(form).getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(completeHandover).not.toHaveBeenCalled()
  })

  it('submit_FileAndSignature_CompletesHandover', async () => {
    completeHandover.mockImplementation(async () => {
      getDb().handovers[0].status = 'Completed'
    })
    const user = setupUser()
    const id = await openDetail('In_Progress')
    const form = region('Hoàn tất bàn giao')
    await user.upload(within(form).getByLabelText(/^Biên bản bàn giao/), pdf('BienBan.pdf'))
    await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), sig('BienBan.sig'))
    await user.click(within(form).getByRole('button', { name: 'Hoàn tất bàn giao' }))
    expect(await screen.findByText('Đã hoàn tất bàn giao')).toBeInTheDocument()
    expect(completeHandover.mock.calls[0][0]).toBe(id)
    expect(completeHandover.mock.calls[0][1].signature.name).toBe('BienBan.sig')
    expect(await screen.findByText('Hồ sơ đã hoàn tất')).toBeInTheDocument()
  })

  it('submit_InvalidSignature400_ShowsMessageWithServerDetail', async () => {
    completeHandover.mockRejectedValue(new ApiError(400, 'Invalid signature, untrusted/expired certificate, or signer certificate not configured.'))
    const user = setupUser()
    await openDetail('In_Progress')
    const form = region('Hoàn tất bàn giao')
    await user.upload(within(form).getByLabelText(/^Biên bản bàn giao/), pdf())
    await user.upload(within(form).getByLabelText(/^Chữ ký số rời/), sig())
    await user.click(within(form).getByRole('button', { name: 'Hoàn tất bàn giao' }))
    const alert = await within(form).findByRole('alert')
    expect(alert).toHaveTextContent('chữ ký')
    expect(alert).toHaveTextContent('signer certificate not configured')
  })
})

// Gõ chuỗi dài bằng cách gán thẳng giá trị để không mất thời gian gõ từng ký tự
function fireTypeLong(element, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
