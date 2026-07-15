import axios from 'axios'
import toast from 'react-hot-toast'

const TOKEN_KEY = 'dms-token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // generous: video uploads and large PDF exports run long
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.message

    // An expired/invalid session should drop the user at login rather than
    // leaving them staring at a broken page. Skip this on the login call
    // itself so a wrong password shows inline instead of reloading.
    const isLoginCall = error.config?.url?.includes('/auth/login')
    if (status === 401 && !isLoginCall) {
      clearToken()
      if (!window.location.pathname.startsWith('/login')) {
        toast.error('Your session expired. Please log in again.')
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
      }
    }

    error.friendlyMessage =
      message ||
      (error.code === 'ECONNABORTED'
        ? 'The request timed out. Please try again.'
        : !error.response
          ? 'Cannot reach the server. Is the backend running on port 8080?'
          : 'Something went wrong. Please try again.')

    return Promise.reject(error)
  },
)

/** Extracts the friendly message from any thrown API error. */
export const errMsg = (e) => e?.friendlyMessage || e?.message || 'Something went wrong'

/** Triggers a browser download for a binary endpoint (PDF/Excel/CSV). */
export async function download(url, { method = 'get', data, filename } = {}) {
  const res = await api.request({ url, method, data, responseType: 'blob' })

  // A failed blob request still returns a blob — unwrap the JSON error inside.
  if (res.data.type === 'application/json') {
    const text = await res.data.text()
    throw new Error(JSON.parse(text).message || 'Download failed')
  }

  const disposition = res.headers['content-disposition'] || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const name = filename || match?.[1] || 'download'

  const objectUrl = URL.createObjectURL(res.data)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

export default api
