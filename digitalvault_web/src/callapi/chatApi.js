import { normalizeMessage } from '../utils/chat'
import axiosClient from './axiosClient'

// API khung chat giữa Executor và Legal Verifier trong cùng một hồ sơ bàn giao (ChatController của BE)

// Lịch sử tin nhắn, BE trả mới nhất trước: { page, pageSize, items }; pageSize hợp lệ 1-100
export async function getHandoverMessages(requestId, { page = 1, pageSize = 50 } = {}) {
  const { data } = await axiosClient.get(`/handovers/${requestId}/messages`, { params: { page, pageSize } })
  return { page: data?.page ?? page, pageSize: data?.pageSize ?? pageSize, items: (data?.items ?? []).map(normalizeMessage) }
}

// Gửi một tin nhắn văn bản (1-4000 ký tự); trả về tin nhắn vừa lưu
export async function sendHandoverMessage(requestId, content) {
  const { data } = await axiosClient.post(`/handovers/${requestId}/messages`, { content })
  return normalizeMessage(data)
}
