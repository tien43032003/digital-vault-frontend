import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmHandoverReceipt } from '../../callapi/beneficiaryApi'
import ReceiptConfirmForm from './ReceiptConfirmForm'

vi.mock('../../callapi/beneficiaryApi', () => ({ confirmHandoverReceipt: vi.fn() }))

const pdf = () => new File(['%PDF-1.4 demo'], 'xac-nhan.pdf', { type: 'application/pdf' })
const sig = () => new File([new Uint8Array(256)], 'xac-nhan.sig')

const renderForm = (onConfirmed = vi.fn()) => {
  render(<ReceiptConfirmForm handoverId={5} onConfirmed={onConfirmed} />)
  return onConfirmed
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã nhận tài sản' }))

describe('ReceiptConfirmForm - bắt buộc tệp xác nhận và chữ ký số', () => {
  beforeEach(() => vi.resetAllMocks())

  it('submit_NoFilesButAccepted_ShowsBothRequiredErrorsAndDoesNotCallApi', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('checkbox'))
    submit()
    expect(await screen.findByText('Vui lòng chọn tệp xác nhận nhận tài sản.')).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(confirmHandoverReceipt).not.toHaveBeenCalled()
  })

  it('submit_FileWithoutSignature_ShowsSignatureRequired', async () => {
    renderForm()
    await userEvent.upload(screen.getByLabelText(/^Tệp xác nhận nhận tài sản/), pdf())
    await userEvent.click(screen.getByRole('checkbox'))
    submit()
    expect(await screen.findByText('Vui lòng chọn file chữ ký rời.')).toBeInTheDocument()
    expect(screen.queryByText('Vui lòng chọn tệp xác nhận nhận tài sản.')).not.toBeInTheDocument()
    expect(confirmHandoverReceipt).not.toHaveBeenCalled()
  })

  it('submit_SignatureTooLarge_ShowsSizeError', async () => {
    renderForm()
    await userEvent.upload(screen.getByLabelText(/^Tệp xác nhận nhận tài sản/), pdf())
    await userEvent.upload(screen.getByLabelText(/^Chữ ký số rời/), new File([new Uint8Array(20000)], 'big.sig'))
    await userEvent.click(screen.getByRole('checkbox'))
    submit()
    expect(await screen.findByText('File chữ ký phải từ 1 byte đến 16 KB.')).toBeInTheDocument()
  })

  it('submit_NotAccepted_StillRequiresConfirmationCheckbox', async () => {
    renderForm()
    await userEvent.upload(screen.getByLabelText(/^Tệp xác nhận nhận tài sản/), pdf())
    await userEvent.upload(screen.getByLabelText(/^Chữ ký số rời/), sig())
    submit()
    expect(await screen.findByText('Vui lòng xác nhận bạn đã nhận đầy đủ tài sản.')).toBeInTheDocument()
    expect(confirmHandoverReceipt).not.toHaveBeenCalled()
  })

  it('submit_Valid_SendsNoteFileAndSignatureAndReportsReceipt', async () => {
    const receipt = { receiptId: 9, handoverId: 5 }
    confirmHandoverReceipt.mockResolvedValue(receipt)
    const onConfirmed = renderForm()
    const file = pdf()
    const signature = sig()
    await userEvent.type(screen.getByLabelText(/^Ghi chú khi nhận/), 'Đã nhận đủ')
    await userEvent.upload(screen.getByLabelText(/^Tệp xác nhận nhận tài sản/), file)
    await userEvent.upload(screen.getByLabelText(/^Chữ ký số rời/), signature)
    await userEvent.click(screen.getByRole('checkbox'))
    submit()
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(receipt))
    expect(confirmHandoverReceipt).toHaveBeenCalledWith(5, { note: 'Đã nhận đủ', file, signature })
  })

  it('submit_Server400_ShowsReadableErrorAndKeepsForm', async () => {
    confirmHandoverReceipt.mockRejectedValue({ status: 400, message: 'Signature is invalid.' })
    renderForm()
    await userEvent.upload(screen.getByLabelText(/^Tệp xác nhận nhận tài sản/), pdf())
    await userEvent.upload(screen.getByLabelText(/^Chữ ký số rời/), sig())
    await userEvent.click(screen.getByRole('checkbox'))
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Thông tin xác nhận không hợp lệ. Signature is invalid.')
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tài sản' })).toBeEnabled()
  })
})
