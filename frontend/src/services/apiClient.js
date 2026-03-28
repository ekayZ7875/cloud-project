const BASE_URL = 'http://localhost:8080/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function getToken() {
  try {
    const stored = localStorage.getItem('auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.token || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function request(endpoint, options = {}) {
  const { body, method = 'GET', isFormData = false, params } = options;

  let url = `${BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!isFormData && body) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  const response = await fetch(url, config);

  if (response.status === 401) {
    localStorage.removeItem('auth');
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 401);
  }

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new ApiError(
      data?.message || data?.error || 'Request failed',
      response.status,
      data
    );
  }

  return data;
}

/**
 * Custom XHR-based upload to support progress tracking
 */
function uploadWithProgress(endpoint, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${BASE_URL}${endpoint}`;

    xhr.open('POST', url);

    const token = getToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      let data = xhr.responseText;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {}

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        if (xhr.status === 401) {
          localStorage.removeItem('auth');
          window.location.href = '/login';
        }
        reject(new ApiError(data?.message || 'Upload failed', xhr.status, data));
      }
    };

    xhr.onerror = () => reject(new ApiError('Network error', 0));
    xhr.send(formData);
  });
}

export const api = {
  get: (endpoint, params) => request(endpoint, { method: 'GET', params }),
  post: (endpoint, body, options = {}) =>
    request(endpoint, { method: 'POST', body, ...options }),
  upload: (endpoint, formData) =>
    request(endpoint, { method: 'POST', body: formData, isFormData: true }),
  uploadWithProgress,
};

export { ApiError };
export default api;
