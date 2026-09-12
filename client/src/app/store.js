import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice.js';
import { toastReducer } from '../features/ui/toastSlice.js';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    toast: toastReducer
  }
});
