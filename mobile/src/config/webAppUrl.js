import Constants from 'expo-constants';

/**
 * The HRMS web app's own public origin (the React SPA under `client/`),
 * NOT the API base URL — mirrors the `EXPO_PUBLIC_API_URL`/`apiBaseUrl`
 * config pattern in `api/client.js` exactly. Used only by the Admin "Manage
 * Users / Role Assignment" deep link, which opens `${WEB_APP_URL}/admin` in
 * the device browser rather than reimplementing HRMS user management here.
 */
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL || Constants.expoConfig?.extra?.webAppUrl || 'http://localhost:5173';
