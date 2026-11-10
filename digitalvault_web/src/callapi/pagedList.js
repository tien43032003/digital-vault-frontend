import axiosClient from './axiosClient'

const PAGE_SIZE = 100
const MAX_PAGES = 50

// Các API danh sách của BE trả PageDto { page, pageSize, items } (tối đa 100 dòng mỗi trang): đọc lần lượt các trang rồi gộp lại.
// Chấp nhận cả mảng thuần (bản BE cũ và mock) để FE chạy được với cả hai.
export async function getAllPages(path, params = {}) {
  const items = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data } = await axiosClient.get(path, { params: { ...params, page, pageSize: PAGE_SIZE } })
    if (Array.isArray(data)) return data
    const pageItems = data?.items ?? []
    items.push(...pageItems)
    // BE có thể tự giới hạn pageSize (vd. tối đa 50): so với pageSize BE trả về để không dừng sớm và bỏ sót dữ liệu cũ
    const effectiveSize = Number(data?.pageSize) > 0 ? Math.min(Number(data.pageSize), PAGE_SIZE) : PAGE_SIZE
    if (pageItems.length === 0 || pageItems.length < effectiveSize) break
  }
  return items
}
