import api from './client';

export const listMine = (params) => api.get('/expenses', { params }).then((res) => res.data.data);

/**
 * `receipt` (optional) is a { uri, name, mimeType } object as returned by
 * expo-document-picker — built into multipart/form-data here rather than in
 * the screen, so every caller gets the same encoding.
 */
export const create = ({ category, date, amount, stationType, from, to, modeOfTravel, receipt }) => {
  const form = new FormData();
  form.append('category', category);
  form.append('date', date);
  form.append('amount', String(amount));
  if (stationType) form.append('stationType', stationType);
  if (from) form.append('from', from);
  if (to) form.append('to', to);
  if (modeOfTravel) form.append('modeOfTravel', modeOfTravel);
  if (receipt) {
    form.append('receipt', { uri: receipt.uri, name: receipt.name || 'receipt', type: receipt.mimeType || 'application/octet-stream' });
  }
  return api.post('/expenses', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((res) => res.data.expense);
};

export const receiptUrl = (expenseId) => `${api.defaults.baseURL}/expenses/${expenseId}/receipt`;
