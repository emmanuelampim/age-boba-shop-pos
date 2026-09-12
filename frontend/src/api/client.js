const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const { body, params, ...rest } = options

  let url = `${API_BASE}${path}`

  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        searchParams.append(key, value)
      }
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }

  const headers = { ...rest.headers }
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    ...rest,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // A 401 while a session is open means the login has expired. Send the
  // cashier back to the sign-in page instead of showing broken screens.
  if (res.status === 401 && !path.startsWith('/auth/login') && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }

  const data = await res.json()

  if (!data.success) {
    throw new Error(data.error?.message || 'Unknown error')
  }

  if (data.pagination) {
    return { data: data.data, pagination: data.pagination }
  }

  return data.data
}

export function get(path, params) {
  return request(path, { method: 'GET', params })
}

export function post(path, body) {
  return request(path, { method: 'POST', body })
}

export function patch(path, body) {
  return request(path, { method: 'PATCH', body })
}

export function del(path) {
  return request(path, { method: 'DELETE' })
}

export function printReceipt(text) {
  return post('/print', { text })
}

export async function downloadFile(path, params, filename) {
  let url = `${API_BASE}${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value != null) searchParams.append(key, value)
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }

  const res = await fetch(url, { method: 'GET', credentials: 'include' })
  if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}). Try again.`)
  }
  const blob = await res.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}
