import api from './client';


export const listHolidays = (year) => api.get('/holidays', { params: { year } }).then((res) => res.data.data);
