import api from './apiClient';

export async function signupWithGoogle(payload) {
  // payload: { uid, email, name, avatar? }
  return api.post('/auth/google-signup', payload);
}

export async function loginWithGoogle(payload) {
  // payload: { email, uid }
  return api.post('/auth/google-login', payload);
}
