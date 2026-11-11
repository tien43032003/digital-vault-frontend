import { HANDOVER_GROUPS, executorNextAction, createHandoverErrorMessage, filterHandovers, handoverCode, handoverStatusInfo, declineReasonFromNotifications, handoverActionErrorMessage, isCancellableStatus, isEditableStatus, isVaultLockedByHandover, ownerCreateHandoverErrorMessage } from './handover'

describe('handoverStatusInfo', () => {
  it.each([
    ['Draft', 'Bản nháp'],
    ['Pending_Legal', 'Chờ thẩm định pháp lý'],
    ['Additional_Info', 'Cần bổ sung hồ sơ'],
    ['Rejected', 'Bị từ chối'],
    ['Approved', 'Đã duyệt pháp lý'],
    ['In_Progress', 'Đang bàn giao'],
    ['Completed', 'Hoàn tất'],
    ['Cancelled', 'Đã hủy'],
  ])('handoverStatusInfo_%s_HasVietnameseLabel', (status, text) => {
    expect(handoverStatusInfo(status).text).toBe(text)
  })

  it('handoverStatusInfo_UnknownStatus_KeepsRawCodeWithMutedTone', () => {
    expect(handoverStatusInfo('Weird')).toEqual({ text: 'Weird', tone: 'muted' })
  })

  it('handoverStatusInfo_Tones_MatchMeaning', () => {
    expect(handoverStatusInfo('Completed').tone).toBe('ok')
    expect(handoverStatusInfo('Rejected').tone).toBe('warn')
    expect(handoverStatusInfo('Pending_Legal').tone).toBe('info')
  })
})

describe('isEditableStatus', () => {
  it.each([['Draft'], ['Rejected'], ['Additional_Info']])('isEditableStatus_%s_ReturnsTrue', (status) => {
    expect(isEditableStatus(status)).toBe(true)
  })

  it.each([['Pending_Legal'], ['Approved'], ['In_Progress'], ['Completed'], ['Cancelled']])('isEditableStatus_%s_ReturnsFalse', (status) => {
    expect(isEditableStatus(status)).toBe(false)
  })
})

describe('filterHandovers', () => {
  const list = [
    { requestId: 1, status: 'Draft' },
    { requestId: 2, status: 'Pending_Legal' },
    { requestId: 3, status: 'Additional_Info' },
    { requestId: 4, status: 'Approved' },
    { requestId: 5, status: 'In_Progress' },
    { requestId: 6, status: 'Completed' },
    { requestId: 7, status: 'Cancelled' },
    { requestId: 8, status: 'Rejected' },
  ]
  const ids = (statuses) => filterHandovers(list, statuses).map((item) => item.requestId)

  it('filterHandovers_NoStatuses_ReturnsAllNewestFirst', () => {
    expect(ids(undefined)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('filterHandovers_Groups_PickTheRightStatuses', () => {
    expect(ids(HANDOVER_GROUPS.pending)).toEqual([8, 3, 2])
    expect(ids(HANDOVER_GROUPS.approved)).toEqual([4])
    expect(ids(HANDOVER_GROUPS.inProgress)).toEqual([5])
    expect(ids(HANDOVER_GROUPS.history)).toEqual([7, 6])
  })

  it('filterHandovers_DoesNotMutateInput', () => {
    const input = [{ requestId: 1, status: 'Draft' }, { requestId: 9, status: 'Draft' }]
    filterHandovers(input, undefined)
    expect(input.map((item) => item.requestId)).toEqual([1, 9])
  })
})

describe('createHandoverErrorMessage', () => {
  it('createHandoverErrorMessage_Conflict_ExplainsOpenRequestOrNoAllocation', () => {
    expect(createHandoverErrorMessage({ status: 409 })).toBe('Kho này đã có hồ sơ bàn giao đang xử lý hoặc chưa có tài sản nào được phân bổ.')
  })

  it('createHandoverErrorMessage_Forbidden_SaysNotAssigned', () => {
    expect(createHandoverErrorMessage({ status: 403 })).toBe('Bạn không được phân công kho này.')
  })

  it('createHandoverErrorMessage_Other_UsesServerMessageOrGeneric', () => {
    expect(createHandoverErrorMessage({ status: 503, message: 'Không có Executor phù hợp.' })).toBe('Không có Executor phù hợp.')
    expect(createHandoverErrorMessage({})).toBe('Đã có lỗi xảy ra, vui lòng thử lại.')
  })
})

describe('ownerCreateHandoverErrorMessage', () => {
  it.each([
    ['Every active asset needs documents and exactly 100 percent active allocation.', 'giấy tờ'],
    ['Vault is inactive or has a protected handover record.', 'hồ sơ bàn giao chưa hủy'],
    ['Assigned Executor must be independent of the owner and beneficiaries.', 'độc lập'],
    ['Beneficiary unavailable.', 'không còn hoạt động'],
    ['Multiple active executors require administrative correction.', 'quản trị viên'],
  ])('ownerCreateHandoverErrorMessage_Conflict%#_MentionsReason', (detail, expected) => {
    expect(ownerCreateHandoverErrorMessage({ status: 409, message: detail })).toContain(expected)
  })

  it('ownerCreateHandoverErrorMessage_UnknownConflict_UsesGenericConflictText', () => {
    expect(ownerCreateHandoverErrorMessage({ status: 409, message: 'Lạ.' })).toBe('Chưa thể tạo hồ sơ bàn giao vì trạng thái kho hiện tại.')
  })

  it('ownerCreateHandoverErrorMessage_NoExecutor503_AsksToAssignExecutor', () => {
    expect(ownerCreateHandoverErrorMessage({ status: 503 })).toContain('gán Người thi hành')
  })

  it('ownerCreateHandoverErrorMessage_NotFoundAndForbidden_AreExplained', () => {
    expect(ownerCreateHandoverErrorMessage({ status: 404 })).toContain('Không tìm thấy kho')
    expect(ownerCreateHandoverErrorMessage({ status: 403 })).toContain('không có quyền')
  })

  it('ownerCreateHandoverErrorMessage_Other_UsesServerMessageOrGeneric', () => {
    expect(ownerCreateHandoverErrorMessage({ status: 500, message: 'Lỗi.' })).toBe('Lỗi.')
    expect(ownerCreateHandoverErrorMessage({})).toBe('Đã có lỗi xảy ra, vui lòng thử lại.')
  })
})

describe('statuses added by the backend intake step', () => {
  it('handoverStatusInfo_PendingExecutor_IsAwaitingLabel', () => {
    expect(handoverStatusInfo('Pending_Executor')).toEqual({ text: 'Chờ Executor tiếp nhận', tone: 'info' })
  })

  it('handoverStatusInfo_Declined_IsExecutorDeclinedLabel', () => {
    expect(handoverStatusInfo('Declined')).toEqual({ text: 'Executor từ chối', tone: 'warn' })
  })

  it.each([['Pending_Executor', true], ['Draft', true], ['Rejected', true], ['Declined', false], ['Pending_Legal', false], ['Approved', false], ['In_Progress', false], ['Completed', false], ['Cancelled', false]])(
    'isCancellableStatus_%s_Returns%s',
    (status, expected) => {
      expect(isCancellableStatus(status)).toBe(expected)
    },
  )

  it('isEditableStatus_PendingExecutorAndDeclined_AreLocked', () => {
    expect(isEditableStatus('Pending_Executor')).toBe(false)
    expect(isEditableStatus('Declined')).toBe(false)
  })

  it('HANDOVER_GROUPS_History_IncludesDeclined', () => {
    expect(HANDOVER_GROUPS.history).toContain('Declined')
  })
})

describe('handoverActionErrorMessage for the intake decision', () => {
  it('handoverActionErrorMessage_Accept409NotReady_ExplainsVaultRequirements', () => {
    expect(handoverActionErrorMessage({ status: 409, message: 'Every active asset needs documents and exactly 100 percent active allocation.' }, 'accept')).toContain('chưa đủ điều kiện')
  })

  it('handoverActionErrorMessage_Accept409Other_SaysNoLongerAwaiting', () => {
    expect(handoverActionErrorMessage({ status: 409, message: 'Only an awaiting Executor request can be accepted.' }, 'accept')).toContain('không còn ở trạng thái chờ tiếp nhận')
  })

  it('handoverActionErrorMessage_Decline400_ExplainsReasonRules', () => {
    expect(handoverActionErrorMessage({ status: 400 }, 'decline')).toContain('Lý do từ chối không hợp lệ')
  })
})

describe('declineReasonFromNotifications', () => {
  const notice = (message) => ({ notificationId: 1, type: 'Handover', title: 'Executor declined handover', message, isRead: false, createdAt: '2026-10-23T01:00:00Z' })

  it('declineReasonFromNotifications_MatchingRequest_ReturnsTrimmedReason', () => {
    expect(declineReasonFromNotifications([notice('Handover #7:  Tôi đang bận công tác ')], 7)).toBe('Tôi đang bận công tác')
  })

  it('declineReasonFromNotifications_OtherRequestsOnly_ReturnsNull', () => {
    expect(declineReasonFromNotifications([notice('Handover #70: Bận'), notice('Handover #8: Bận')], 7)).toBeNull()
  })

  it('declineReasonFromNotifications_NewestFirstDuplicates_ReturnsFirstMatch', () => {
    expect(declineReasonFromNotifications([notice('Handover #7: Lần sau'), notice('Handover #7: Lần trước')], 7)).toBe('Lần sau')
  })

  it('declineReasonFromNotifications_EmptyOrMissing_ReturnsNull', () => {
    expect(declineReasonFromNotifications([], 7)).toBeNull()
    expect(declineReasonFromNotifications(undefined, 7)).toBeNull()
  })

  it('declineReasonFromNotifications_NoReasonText_ReturnsNull', () => {
    expect(declineReasonFromNotifications([notice('Handover #7:   ')], 7)).toBeNull()
  })
})

describe('isVaultLockedByHandover', () => {
  const handovers = [
    { requestId: 1, vaultId: 1, status: 'Cancelled' },
    { requestId: 2, vaultId: 1, status: 'Declined' },
    { requestId: 3, vaultId: 2, status: 'Pending_Executor' },
  ]

  it('isVaultLockedByHandover_OnlyCancelledOrDeclined_ReturnsFalse', () => {
    expect(isVaultLockedByHandover(handovers, 1)).toBe(false)
  })

  it('isVaultLockedByHandover_OpenHandoverOfVault_ReturnsTrue', () => {
    expect(isVaultLockedByHandover(handovers, 2)).toBe(true)
  })

  it('isVaultLockedByHandover_OtherVaultOrEmpty_ReturnsFalse', () => {
    expect(isVaultLockedByHandover(handovers, 9)).toBe(false)
    expect(isVaultLockedByHandover([], 1)).toBe(false)
    expect(isVaultLockedByHandover(undefined, 1)).toBe(false)
  })
})

describe('handoverActionErrorMessage for plan storage limit', () => {
  it('handoverActionErrorMessage_UploadHitsOwnerStorageLimit_TellsExecutorToAskOwnerToUpgrade', () => {
    const message = handoverActionErrorMessage({ status: 409, message: 'Storage limit exceeded. Used 1048576000 bytes; limit is 1073741824 bytes.' }, 'upload')
    expect(message).toContain('chủ kho')
    expect(message).toContain('nâng cấp gói')
  })

  it('handoverActionErrorMessage_UploadOtherConflict_KeepsStatusMessage', () => {
    expect(handoverActionErrorMessage({ status: 409, message: 'x' }, 'upload')).toBe('Hồ sơ không còn ở trạng thái cho phép nộp thêm giấy tờ.')
  })
})

describe('handoverCode', () => {
  it('code_WithCreatedDate_IsPrefixYearAndPaddedNumber', () => {
    expect(handoverCode({ requestId: 7, initiatedAt: '2026-10-24T02:50:00Z' })).toBe('HS-2026-0007')
    expect(handoverCode({ requestId: 12, initiatedAt: '2026-01-05T12:00:00Z' })).toBe('HS-2026-0012')
  })

  it('code_NumberOverFourDigits_IsNotTruncated', () => {
    expect(handoverCode({ requestId: 1002, initiatedAt: '2026-10-29T14:29:00Z' })).toBe('HS-2026-1002')
    expect(handoverCode({ requestId: 123456, initiatedAt: '2026-10-29T14:29:00Z' })).toBe('HS-2026-123456')
  })

  it('code_NoCreatedDateOrInvalid_OmitsYear', () => {
    expect(handoverCode({ requestId: 7 })).toBe('HS-0007')
    expect(handoverCode({ requestId: 7, initiatedAt: 'không phải ngày' })).toBe('HS-0007')
  })

  it('code_DateWithoutTimezone_IsReadAsUtcLikeTheRestOfTheApp', () => {
    // 31/12 23:30 UTC đã sang năm mới ở Việt Nam (UTC+7) nhưng vẫn là cùng một mốc với chuỗi có Z
    expect(handoverCode({ requestId: 3, initiatedAt: '2026-12-31T23:30:00' })).toBe(handoverCode({ requestId: 3, initiatedAt: '2026-12-31T23:30:00Z' }))
  })
})

describe('executorNextAction', () => {
  it.each([
    ['Pending_Executor', 'Xem và tiếp nhận', 'link'],
    ['Draft', 'Tiếp tục hồ sơ', 'link'],
    ['Pending_Legal', 'Theo dõi thẩm định', 'link'],
    ['Additional_Info', 'Bổ sung và gửi lại', 'link'],
    ['Rejected', 'Bổ sung và gửi lại', 'link'],
    ['Approved', 'Bắt đầu bàn giao', 'start'],
    ['In_Progress', 'Hoàn tất bàn giao', 'link'],
    ['Completed', 'Xem hồ sơ', 'link'],
    ['Cancelled', 'Xem hồ sơ', 'link'],
    ['Declined', 'Xem hồ sơ', 'link'],
    ['Unknown', 'Xem hồ sơ', 'link'],
  ])('%s_GivesTheRightNextStep', (status, label, kind) => {
    expect(executorNextAction(status)).toMatchObject({ label, kind })
  })
})
