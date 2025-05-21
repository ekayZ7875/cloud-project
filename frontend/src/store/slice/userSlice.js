import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import config from '../../../utils/config';

const API_URL = import.meta.env.VITE_API_URL;

// Async thunk for user login
export const loginUser = createAsyncThunk(
  'user/login',
  async (credentials, { rejectWithValue }) => {
    try {
       console.log("credentials",credentials);
       
      const response = await axios.post("http://localhost:5000/api/auth/google-login", credentials);
      console.log("response",response);
      const token = response.data.token;
      const user = response.data.user;
      if (!token || !user) {
        throw new Error('Token or user data missing in response');
      }
      localStorage.setItem('token', token);
      return { token, user };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Login failed');
    }
  }
);

// Async thunk for user signUp
export const signUp = createAsyncThunk(
  'user/singUp',
  async (credentials, { rejectWithValue }) => {
    try {
       console.log("credentials",credentials);
      const response = await axios.post("http://localhost:5000/api/auth/google-signup", credentials);
      console.log("response",response);
      const token = response.data.token;
      const user = response.data.user;
      if (!token || !user) {
        throw new Error('Token or user data missing in response');
      }
      localStorage.setItem('token', token);
      return { token, user };
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Login failed');
    }
  }
);

// Async thunk to fetch user profile
export const fetchUserProfile = createAsyncThunk(
  'user/fetchProfile',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().user.token;

      if (!token) throw new Error('No token available');

      const response = await axios.get(`${API_URL}/api/auth/get-user`, {
        headers: { Authorization: token },
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data || 'Failed to fetch profile');
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState: {
    userInfo: null,
    profileData: null,
    token: localStorage.getItem('token') || null,
    status: 'idle',
    error: null,
    profileError: null,
    isAuthenticated: !!localStorage.getItem('token'),
  },
  reducers: {
    logout: (state) => {
      localStorage.removeItem('token');
      state.userInfo = null;
      state.token = null;
      state.isAuthenticated = false;
    },
    setCredentials: (state, action) => {
      state.userInfo = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.userInfo = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || action.error.message;
      })
      // Profile
      .addCase(fetchUserProfile.pending, (state) => {
        state.profileStatus = 'loading';
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.profileStatus = 'succeeded';
        state.profileData = action.payload;
        state.userInfo = {
          ...state.userInfo,
          ...action.payload,
        };
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.profileStatus = 'failed';
        state.profileError = action.payload || action.error.message;
      });
  },
});

export const { logout, setCredentials, clearError } = userSlice.actions;
export default userSlice.reducer;

// Selectors
export const selectCurrentUser = (state) => state.user.userInfo;
export const selectIsAuthenticated = (state) => state.user.isAuthenticated;
export const selectAuthStatus = (state) => state.user.status;
export const selectAuthError = (state) => state.user.error;
export const selectAuthToken = (state) => state.user.token;
export const selectProfileData = (state) => state.user.profileData;
export const selectProfileStatus = (state) => state.user.profileStatus;
export const selectProfileError = (state) => state.user.profileError;
