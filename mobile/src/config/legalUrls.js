import { Linking, Alert } from 'react-native';
import Constants from 'expo-constants';

/**
 * Derives the base URL without trailing slash or '/api'.
 */
function deriveBaseOrigin() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiBaseUrl || '';
  if (apiUrl && !apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
    return apiUrl.replace(/\/api\/?$/, '');
  }
  return 'https://hrms-mirus.com';
}

const baseOrigin = deriveBaseOrigin();

/**
 * Public HTTPS Privacy Policy URL required for Google Play Console submission.
 * Accessible to any public visitor, web crawler, and Google Play reviewer without authentication.
 */
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ||
  Constants.expoConfig?.extra?.privacyPolicyUrl ||
  `${baseOrigin}/privacy-policy`;

/**
 * Public HTTPS Account & Data Deletion URL required by Google Play Data Safety policy.
 */
export const ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL ||
  Constants.expoConfig?.extra?.accountDeletionUrl ||
  `${baseOrigin}/account-deletion`;

/**
 * Public HTTPS Terms of Service URL.
 */
export const TERMS_URL =
  process.env.EXPO_PUBLIC_TERMS_URL ||
  Constants.expoConfig?.extra?.termsUrl ||
  `${baseOrigin}/terms`;

/**
 * Open a URL in the device browser with safety check.
 */
export async function openUrlSafely(url, label = 'link') {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Unable to open link', `Could not open ${label}: ${url}`);
    }
  } catch (err) {
    Alert.alert('Error', `An error occurred while opening the ${label}.`);
  }
}

export const openPrivacyPolicyInBrowser = () => openUrlSafely(PRIVACY_POLICY_URL, 'Privacy Policy');
export const openAccountDeletionInBrowser = () => openUrlSafely(ACCOUNT_DELETION_URL, 'Account Deletion');
export const openTermsInBrowser = () => openUrlSafely(TERMS_URL, 'Terms of Service');
