import { useCallback, useEffect, useState } from 'react'
import { getLifeConfirmation, listOwnerHandovers } from '../callapi/ownerApi'
import { isOwnerLockedByHandover } from '../utils/handover'

const INITIAL_STATE = { status: 'loading', data: null, lockedByHandover: false, error: '' }

// Lần xác nhận còn sống gần nhất của Owner: data = { ownerId, lastConfirmedAliveAt } (thời gian là null khi chưa xác nhận lần nào).
// apply nhận kết quả của lần bấm xác nhận để cập nhật ngay không cần tải lại.
export function useProofOfLife() {
  const [state, setState] = useState(INITIAL_STATE)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([getLifeConfirmation(), listOwnerHandovers(1, 100).catch(() => ({ items: [] }))])
      .then(([data, handovers]) => {
        if (!cancelled) {
          setState({
            status: 'ready',
            data,
            lockedByHandover: isOwnerLockedByHandover(handovers?.items),
            error: '',
          })
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'error', data: null, lockedByHandover: false, error: error?.message || 'Đã có lỗi xảy ra.' })
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => {
    setState(INITIAL_STATE)
    setReloadKey((key) => key + 1)
  }, [])

  const apply = useCallback((data) => setState((prev) => ({ ...prev, status: 'ready', data, error: '' })), [])

  return { ...state, reload, apply }
}
