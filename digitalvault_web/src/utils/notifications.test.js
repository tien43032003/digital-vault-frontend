import { describeNotification, formatUnreadCount } from './notifications'

const notice = (overrides) => ({ notificationId: 1, type: 'Handover', title: 'Executor accepted handover', message: 'The assigned Executor accepted your handover request.', isRead: false, createdAt: '2026-10-23T01:00:00Z', ...overrides })

describe('describeNotification', () => {
  it('describeNotification_ExecutorAccepted_ReturnsVietnameseTitleAndBody', () => {
    expect(describeNotification(notice())).toMatchObject({
      title: 'Executor đã tiếp nhận hồ sơ bàn giao',
      body: 'Executor được giao đã tiếp nhận hồ sơ bàn giao của bạn.',
      tone: 'ok',
      requestId: null,
    })
  })

  it('describeNotification_ExecutorDeclined_ExtractsRequestIdAndReason', () => {
    expect(describeNotification(notice({ title: 'Executor declined handover', message: 'Handover #12:  Tôi đang bận công tác ' }))).toMatchObject({
      title: 'Executor đã từ chối hồ sơ bàn giao',
      body: 'Hồ sơ #12 bị từ chối. Lý do: Tôi đang bận công tác',
      tone: 'warn',
      requestId: 12,
    })
  })

  it('describeNotification_DeclinedWithoutReasonText_StillExplains', () => {
    expect(describeNotification(notice({ title: 'Executor declined handover', message: 'Handover #12:   ' })).body).toBe('Hồ sơ #12 bị từ chối.')
  })

  it('describeNotification_UnknownTitle_KeepsServerTitleAndVietnamizesHandoverNumber', () => {
    expect(describeNotification(notice({ title: 'Something new', message: 'Handover #7 changed' }))).toMatchObject({
      title: 'Something new',
      body: 'Hồ sơ #7 changed',
      tone: 'info',
      requestId: 7,
    })
  })

  it.each([
    ['Beneficiary designated', 'Bạn được chỉ định là người thụ hưởng'],
    ['Allocation changed', 'Tỉ lệ phân bổ di sản đã thay đổi'],
    ['Vault assigned', 'Bạn được giao làm người thi hành kho'],
    ['Handover assigned', 'Có hồ sơ bàn giao mới được giao'],
    ['Legal review assigned', 'Có hồ sơ mới cần thẩm định pháp lý'],
    ['Legal review updated', 'Kết quả thẩm định pháp lý đã cập nhật'],
    ['Inheritance available', 'Di sản đã sẵn sàng cho bạn'],
    ['Handover completed', 'Hồ sơ bàn giao đã hoàn tất'],
    ['Receipt confirmed', 'Đã xác nhận nhận tài sản'],
  ])('describeNotification_%s_ReturnsVietnameseTitle', (title, expected) => {
    const info = describeNotification(notice({ title, message: 'Some English text for Handover #3' }))
    expect(info.title).toBe(expected)
    expect(info.body).not.toMatch(/English/)
  })

  it('describeNotification_BeneficiaryDesignated_KeepsAssetNameAndPercent', () => {
    expect(describeNotification(notice({ title: 'Beneficiary designated', message: "You were designated for asset 'Nhà Q1' with 40%." })).body).toBe(
      'Bạn đã được chỉ định là người thụ hưởng của tài sản "Nhà Q1" với tỉ lệ phân bổ 40%.',
    )
  })

  it('describeNotification_HandoverCompleted_LinksRequestId', () => {
    expect(describeNotification(notice({ title: 'Handover completed', message: 'Handover #21 was completed.' }))).toMatchObject({ requestId: 21, tone: 'ok' })
  })

  it('describeNotification_Type_IsTranslated', () => {
    expect(describeNotification(notice({ type: 'Handover' })).typeLabel).toBe('Bàn giao')
  })

  it('describeNotification_AssignmentRevoked_ReturnsVietnamese', () => {
    expect(describeNotification(notice({ type: 'Assignment', title: 'Vault assignment revoked', message: 'The Owner revoked your vault assignment.' })).title).toBe('Phân công Executor đã bị thu hồi')
  })

  it('describeNotification_MissingFields_DoesNotThrow', () => {
    expect(describeNotification({ notificationId: 2 })).toMatchObject({ title: 'Thông báo', body: '', requestId: null })
  })
})

describe('formatUnreadCount', () => {
  it.each([
    [0, ''],
    [3, '3'],
    [99, '99'],
    [100, '99+'],
    [250, '99+'],
  ])('formatUnreadCount_%i_Returns%s', (count, expected) => {
    expect(formatUnreadCount(count)).toBe(expected)
  })
})
