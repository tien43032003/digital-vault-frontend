import { documentSubmittedAt, documentSubmittedLabel } from './handover'

describe('documentSubmittedAt', () => {
  it('submitAt_Present_IsUsed', () => {
    expect(documentSubmittedAt({ submitAt: '2026-11-10T13:03:48' })).toBe('2026-11-10T13:03:48')
  })

  it('submittedAtOnly_IsAlsoAccepted', () => {
    expect(documentSubmittedAt({ submittedAt: '2026-11-10T13:03:48' })).toBe('2026-11-10T13:03:48')
  })

  it.each([[{}], [null], [undefined], [{ submitAt: null }]])('missing_ReturnsNull', (document) => {
    expect(documentSubmittedAt(document)).toBeNull()
  })

  it('label_UtcWithoutZ_IsShownInLocalTime', () => {
    // BE trả UTC không có Z: 13:03 UTC phải hiển thị theo giờ máy, giống các mốc thời gian khác
    const expected = new Date('2026-11-10T13:03:48Z')
    const pad = (n) => String(n).padStart(2, '0')
    expect(documentSubmittedLabel({ submitAt: '2026-11-10T13:03:48' })).toBe(
      `Nộp lúc ${pad(expected.getDate())}/${pad(expected.getMonth() + 1)}/${expected.getFullYear()} ${pad(expected.getHours())}:${pad(expected.getMinutes())}`,
    )
  })

  it('label_Missing_IsEmpty', () => {
    expect(documentSubmittedLabel({})).toBe('')
  })
})
