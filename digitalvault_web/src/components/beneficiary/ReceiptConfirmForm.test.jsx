import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { confirmHandoverReceipt } from '../../callapi/beneficiaryApi'
import ReceiptConfirmForm from './ReceiptConfirmForm'

vi.mock('../../callapi/beneficiaryApi', () => ({ confirmHandoverReceipt: vi.fn() }))

const pdf = () => new File(['pdf'], 'XacNhan.pdf', { type: 'application/pdf' })
const sig = () => new File(['sig'], 'XacNhan.sig', { type: 'application/octet-stream' })

const fill = async ({ file = true, signature = true, accept = true } = {}) => {
  if (file) await userEvent.upload(screen.getByLabelText(/Biên bản xác nhận đã nhận tài sản/), pdf())
  if (signature) await userEvent.upload(screen.getByLabelText(/Chữ ký số rời/), sig())
  if (accept) await userEvent.click(screen.getByRole('checkbox'))
}
const submit = () => userEvent.click(screen.getByRole('button', { name: /xác nhận đã nhận tài sản/i }))

beforeEach(() => vi.mocked(confirmHandoverReceipt).mockReset())
afterEach(() => vi.mocked(confirmHandoverReceipt).mockReset())

describe('ReceiptConfirmForm digital signature requirement', () => {
  it('submit_WithoutFileAndSignature_ShowsRequiredErrorsAndDoesNotCallApi', async () => {
    render(<ReceiptConfirmForm handoverId={5} onConfirmed={vi.fn()} />)
    await fill({ file: false, signature: false })
    await submit()
    expect(screen.getByText('Vui lòng chọn file giấy tờ.')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(confirmHandoverReceipt).not.toHaveBeenCalled()
  })

  it('submit_FileButNoSignature_RequiresSignature', async () => {
    render(<ReceiptConfirmForm handoverId={5} onConfirmed={vi.fn()} />)
    await fill({ signature: false })
    await submit()
    expect(screen.getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(confirmHandoverReceipt).not.toHaveBeenCalled()
  })

  it('submit_FileAndSignature_SendsBothWithNoteAndCallsOnConfirmed', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(confirmHandoverReceipt).mockResolvedValue({ receiptId: 9 })
    render(<ReceiptConfirmForm handoverId={5} onConfirmed={onConfirmed} />)
    await userEvent.type(screen.getByLabelText(/Ghi chú khi nhận/), 'Đã nhận đủ')
    await fill()
    await submit()
    expect(confirmHandoverReceipt).toHaveBeenCalledTimes(1)
    const [id, input] = vi.mocked(confirmHandoverReceipt).mock.calls[0]
    expect(id).toBe(5)
    expect(input.file.name).toBe('XacNhan.pdf')
    expect(input.signature.name).toBe('XacNhan.sig')
    expect(input.note).toBe('Đã nhận đủ')
    expect(onConfirmed).toHaveBeenCalledWith({ receiptId: 9 })
  })

  it('submit_InvalidSignatureFromBackend_ShowsSignatureError', async () => {
    vi.mocked(confirmHandoverReceipt).mockImplementation(async () => {
      const error = new Error('Invalid signature, untrusted/expired certificate.')
      error.status = 400
      throw error
    })
    render(<ReceiptConfirmForm handoverId={5} onConfirmed={vi.fn()} />)
    await fill()
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Chữ ký số không hợp lệ')
  })
})
