import { createSlice } from '@reduxjs/toolkit';

let seq = 0;

const toastSlice = createSlice({
  name: 'toast',
  initialState: { items: [] },
  reducers: {
    pushToast: {
      reducer(state, action) { state.items.push(action.payload); },
      prepare({ type = 'success', message, title }) {
        seq += 1;
        return { payload: { id: seq, type, message, title } };
      }
    },
    dismissToast(state, action) {
      state.items = state.items.filter((t) => t.id !== action.payload);
    }
  }
});

export const { pushToast, dismissToast } = toastSlice.actions;
export const toastReducer = toastSlice.reducer;

// Convenience helpers.
export const notifySuccess = (message, title) => pushToast({ type: 'success', message, title });
export const notifyError = (message, title) => pushToast({ type: 'error', message, title });
export const selectToasts = (state) => state.toast.items;
