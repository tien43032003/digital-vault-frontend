import axios from 'axios'
import { clearTokens, getTokens, setTokens } from '../utils/tokenStorage'

// Các method không làm thay đổi dữ liệu thì BE không yêu cầu header chống CSRF
const SAFE_METHODS = ['get', 'head', 'options']

// Lỗi API đã được chuẩn hoá từ response { status, detail } của BE
export class ApiError extends Error {
  constructor(status, message, code = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    // Mã lý do do BE gửi kèm (vd PLAN_CHANGE_LOCKED, SUBSCRIPTION_EXPIRED); null khi BE không gửi
    this.code = code
  }
}

let unauthorizedHandler = null

// Đăng ký hàm xử lý khi phiên hết hạn (401), thường là logout và về trang đăng nhập
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

const axiosClient = axios.create({
  baseURL: BASE_URL,
  // BE xác thực bằng JWT Bearer (header Authorization) nên không gửi cookie
  // Quá thời gian thì axios báo lỗi như mất kết nối (status 0) để giao diện hiện đúng thông báo
  timeout: 30000,
  headers: { Accept: 'application/json' },
})

axiosClient.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (!SAFE_METHODS.includes(method)) {
    // BE từ chối mọi request thay đổi dữ liệu thiếu header này
    config.headers['X-Vault-Request'] = '1'
  }
  const tokens = getTokens()
  if (tokens && !config.headers.Authorization) config.headers.Authorization = `Bearer ${tokens.accessToken}`
  return config
})

// Nhiều request cùng hết hạn một lúc chỉ gọi refresh một lần (BE xoay vòng refresh token nên gọi hai lần sẽ làm hỏng)
let refreshPromise = null

async function refreshTokens() {
  const tokens = getTokens()
  // Dùng axios trần để lỗi của chính request refresh không đi qua interceptor này và gây vòng lặp
  const { data } = await axios.post(
    `${BASE_URL}/auth/refresh-token`,
    { refreshToken: tokens.refreshToken },
    { headers: { Accept: 'application/json', 'X-Vault-Request': '1' }, timeout: 30000 },
  )
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken, expiresAt: data.refreshTokenExpiresAt })
}

// Thử làm mới token cho request vừa bị 401. Trả true nếu đã có token mới để gửi lại.
async function tryRefresh(request) {
  const tokens = getTokens()
  if (!request || request.refreshAttempted || !request.headers?.Authorization || !tokens?.refreshToken) return false
  request.refreshAttempted = true
  refreshPromise ??= refreshTokens().finally(() => {
    refreshPromise = null
  })
  try {
    await refreshPromise
    return true
  } catch {
    clearTokens()
    return false
  }
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status ?? 0

    if (status === 401 && (await tryRefresh(error.config))) {
      error.config.headers.Authorization = `Bearer ${getTokens().accessToken}`
      return axiosClient(error.config)
    }

    const detail = error.response?.data?.detail
    const message = detail || (status === 0 ? 'Không thể kết nối tới máy chủ.' : 'Đã có lỗi xảy ra, vui lòng thử lại.')

    if (status === 401) {
      // Không còn cách khôi phục phiên: bỏ token cũ để request sau không gửi token hỏng
      if (!error.config?.skipAuthRedirect || error.config?.refreshAttempted) clearTokens()
      if (!error.config?.skipAuthRedirect && unauthorizedHandler) unauthorizedHandler()
    }
    const code = error.response?.data?.code ?? error.response?.data?.errorCode ?? null
    return Promise.reject(new ApiError(status, message, code))
  },
)

export default axiosClient
