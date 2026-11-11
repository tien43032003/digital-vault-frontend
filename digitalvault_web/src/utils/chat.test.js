import { canShowChat, CHAT_POLL_MS, MAX_MESSAGE_LENGTH, mergeMessages, normalizeMessage, senderRoleLabel } from './chat'

describe('canShowChat', () => {
  it('canShowChat_StatusesWithLegalReviewOrLater_ReturnsTrue', () => {
    for (const status of ['Pending_Legal', 'Additional_Info', 'Approved', 'In_Progress', 'Completed', 'Rejected']) {
      expect(canShowChat(status)).toBe(true)
    }
  })

  it('canShowChat_EarlyOrClosedWithoutLegalStatuses_ReturnsFalse', () => {
    for (const status of ['Pending_Executor', 'Declined', 'Cancelled', 'Draft', '', undefined, null]) {
      expect(canShowChat(status)).toBe(false)
    }
  })
})

describe('normalizeMessage', () => {
  it('normalize_BackendShape_UsesSentAtAsCreatedAt', () => {
    expect(normalizeMessage({ messageId: 7, conversationId: 3, senderId: 2, senderName: 'An', senderRole: 'Executor', content: ' xin chào ', messageType: 'Text', sentAt: '2026-11-09T10:00:00Z' })).toEqual({
      messageId: 7,
      senderId: 2,
      senderName: 'An',
      senderRole: 'Executor',
      content: ' xin chào ',
      messageType: 'Text',
      createdAt: '2026-11-09T10:00:00Z',
    })
  })

  it('normalize_DocumentedShape_KeepsCreatedAt', () => {
    expect(normalizeMessage({ messageId: 1, senderId: 1, senderName: 'B', senderRole: 'LegalVerifier', content: 'x', createdAt: '2026-11-09T11:00:00Z' }).createdAt).toBe('2026-11-09T11:00:00Z')
  })

  it('normalize_MissingOptionalFields_FillsSafeDefaults', () => {
    expect(normalizeMessage({ messageId: 1, senderId: 1, content: 'x', sentAt: '2026-11-09T10:00:00Z' })).toMatchObject({ senderName: '', senderRole: '', messageType: 'Text' })
  })
})

describe('mergeMessages', () => {
  const m = (id, at) => ({ messageId: id, senderId: 1, content: `m${id}`, createdAt: at })

  it('merge_NewestFirstInput_ReturnsOldestFirst', () => {
    const merged = mergeMessages([], [m(3, '2026-11-09T10:03:00Z'), m(2, '2026-11-09T10:02:00Z'), m(1, '2026-11-09T10:01:00Z')])
    expect(merged.map((item) => item.messageId)).toEqual([1, 2, 3])
  })

  it('merge_DuplicateMessageId_KeepsOnlyOne', () => {
    const merged = mergeMessages([m(1, '2026-11-09T10:01:00Z'), m(2, '2026-11-09T10:02:00Z')], [m(2, '2026-11-09T10:02:00Z'), m(3, '2026-11-09T10:03:00Z')])
    expect(merged.map((item) => item.messageId)).toEqual([1, 2, 3])
  })

  it('merge_SameTimestamp_OrdersByMessageId', () => {
    const merged = mergeMessages([], [m(5, '2026-11-09T10:00:00Z'), m(4, '2026-11-09T10:00:00Z')])
    expect(merged.map((item) => item.messageId)).toEqual([4, 5])
  })

  it('merge_NothingNew_ReturnsSameArrayInstanceToAvoidRerender', () => {
    const current = [m(1, '2026-11-09T10:01:00Z')]
    expect(mergeMessages(current, [m(1, '2026-11-09T10:01:00Z')])).toBe(current)
  })
})

describe('chat constants and labels', () => {
  it('constants_Defaults_MatchBackendLimitsAndPollingInterval', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(4000)
    expect(CHAT_POLL_MS).toBe(5000)
  })

  it('senderRoleLabel_KnownAndUnknownRoles_ReturnsVietnameseLabel', () => {
    expect(senderRoleLabel('Executor')).toBe('Người thi hành')
    expect(senderRoleLabel('LegalVerifier')).toBe('Người thẩm định')
    expect(senderRoleLabel('Whatever')).toBe('Whatever')
    expect(senderRoleLabel('')).toBe('')
  })
})
