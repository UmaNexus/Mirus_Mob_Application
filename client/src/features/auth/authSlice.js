import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../lib/axios.js';

/**
 * status:
 *   'booting'         - checking existing session on app load
 *   'authenticated'   - user present
 *   'unauthenticated' - no valid session
 */
const initialState = { user: null, status: 'booting', error: null };

export const bootstrapAuth = createAsyncThunk('auth/bootstrap', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me');
    return data.user;
  } catch (err) {
    return rejectWithValue(err.uiMessage);
  }
});

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    return data.user;
  } catch (err) {
    return rejectWithValue(err.uiMessage);
  }
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try { await api.post('/auth/logout'); } catch { /* ignore */ }
  return true;
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Keep the cached user in sync after profile edits / avatar changes.
    setUser(state, action) { state.user = action.payload; },
    patchUser(state, action) { state.user = { ...state.user, ...action.payload }; }
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.fulfilled, (s, a) => { s.user = a.payload; s.status = 'authenticated'; })
      .addCase(bootstrapAuth.rejected, (s) => { s.user = null; s.status = 'unauthenticated'; })
      .addCase(login.pending, (s) => { s.error = null; })
      .addCase(login.fulfilled, (s, a) => { s.user = a.payload; s.status = 'authenticated'; })
      .addCase(login.rejected, (s, a) => { s.error = a.payload || 'Login failed'; })
      .addCase(logout.fulfilled, (s) => { s.user = null; s.status = 'unauthenticated'; });
  }
});

export const { setUser, patchUser } = authSlice.actions;
export const selectAuth = (state) => state.auth;
export const selectUser = (state) => state.auth.user;
export default authSlice.reducer;
