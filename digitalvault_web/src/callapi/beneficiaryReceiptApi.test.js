import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmHandoverReceipt } from './beneficiaryApi'
import axiosClient from './axiosClient'
import { validateReceipt } from '../utils/beneficiary'

vi.mock('./axiosClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const file = () => new File(['x'], 'xac-nhan.pdf', { type: 'application/pdf' })
const signature = () => new File([new Uint8Array(64)], 'xac-nhan.sig')

describe('confirmHandoverReceipt', () => {
  beforeEach(() => vi.resetAllMocks())

  it('Input_PostsMultipartFileSignatureAndTrimmedNote', async () => {
    axiosClient.post.mockResolvedValue({ data: { receiptId: 3 } })
    const f = file()
    const s = signature()
    await expect(confirmHandoverReceipt(5, { note: '  Đã nhận đủ  ', file: f, signature: s })).resolves.toEqual({ receiptId: 3 })
    const [url, form] = axiosClient.post.mock.calls[0]
    expect(url).toBe('/beneficiary/handovers/5/receipt')
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('File')).toBe(f)
    expect(form.get('Signature')).toBe(s)
    expect(form.get('Note')).toBe('Đã nhận đủ')
  })

  it('BlankNote_OmitsNoteField', async () => {
    axiosClient.post.mockResolvedValue({ data: {} })
    await confirmHandoverReceipt(5, { note: '   ', file: file(), signature: signature() })
    expect(axiosClient.post.mock.calls[0][1].has('Note')).toBe(false)
  })
})

describe('validateReceipt', () => {
  const base = { note: '', accepted: true, file: { name: 'a.pdf', type: 'application/pdf', size: 10 }, signature: { name: 'a.sig', size: 64 } }

  it('Valid_ReturnsNoErrors', () => {
    expect(validateReceipt(base)).toEqual({})
  })

  it('MissingFileAndSignature_ReturnsBothRequiredErrors', () => {
    expect(validateReceipt({ ...base, file: null, signature: null })).toEqual({
      file: 'Vui lòng chọn tệp xác nhận nhận tài sản.',
      signature: 'Vui lòng chọn file chữ ký rời.',
    })
  })

  it('NotAccepted_ReturnsAcceptedError', () => {
    expect(validateReceipt({ ...base, accepted: false })).toEqual({ accepted: 'Vui lòng xác nhận bạn đã nhận đầy đủ tài sản.' })
  })

  it('NoteTooLong_ReturnsNoteError', () => {
    expect(validateReceipt({ ...base, note: 'x'.repeat(1001) })).toEqual({ note: 'Ghi chú tối đa 1000 ký tự.' })
  })
})
