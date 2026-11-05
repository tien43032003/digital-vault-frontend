import { useEffect, useState } from 'react'
import { SUBSCRIPTION_EXPIRED_EVENT } from '../callapi/axiosClient'
import { getMySubscription } from '../callapi/paymentApi'

// Tài khoản có đang ở chế độ chỉ xem (gói trả phí đã hết hạn, chưa có gói thay thế) hay không.
// Lỗi khi hỏi BE thì coi như vẫn được thao tác; BE mới là nơi chặn thật. Khi một thao tác bị BE từ chối vì hết hạn thì chuyển sang chỉ xem ngay.
export function useReadOnlyStatus() {
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    let active = true
    getMySubscription()
      .then((data) => {
        if (active) setReadOnly(Boolean(data?.isReadOnly))
      })
      .catch(() => {})
    const onExpired = () => setReadOnly(true)
    window.addEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired)
    return () => {
      active = false
      window.removeEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired)
    }
  }, [])

  return readOnly
}
