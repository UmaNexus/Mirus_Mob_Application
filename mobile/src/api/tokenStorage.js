import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Secure, encrypted, per-device token storage (Keychain on iOS, Keystore-
 * backed EncryptedSharedPreferences on Android) — never AsyncStorage/plain
 * localStorage-equivalent, per the "never store auth tokens insecurely" rule.
 *
 * `expo-secure-store` has no web implementation at all (it throws
 * "getValueWithKeyAsync is not a function", discovered running this app in
 * Expo's web preview) — this app targets iOS/Android, web is dev-preview
 * only, so `sessionStorage` there is an accepted, clearly-labeled exception
 * to the "never insecure storage" rule, not a silent downgrade for a real
 * deployment target.
 */
const TOKEN_KEY = 'mirus_auth_token';
const isWeb = Platform.OS === 'web';

export const saveToken = (token) =>
  isWeb ? Promise.resolve(window.sessionStorage.setItem(TOKEN_KEY, token)) : SecureStore.setItemAsync(TOKEN_KEY, token);

export const getToken = () =>
  isWeb ? Promise.resolve(window.sessionStorage.getItem(TOKEN_KEY)) : SecureStore.getItemAsync(TOKEN_KEY);

export const clearToken = () =>
  isWeb ? Promise.resolve(window.sessionStorage.removeItem(TOKEN_KEY)) : SecureStore.deleteItemAsync(TOKEN_KEY);
