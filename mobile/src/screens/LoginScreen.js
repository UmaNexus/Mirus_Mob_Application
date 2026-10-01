import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';
import BrandLogo from '../components/BrandLogo';
import { openPrivacyPolicyInBrowser, openTermsInBrowser } from '../config/legalUrls';
import { colors, spacing, radii, typography } from '../theme';

/**
 * Real login screen — company code + email-or-employee-ID + password against
 * the existing `POST /api/auth/login`. Unlike the HTML demo, there is no
 * role picker: the role and field-force tier come back from the server on
 * `user` and drive navigation from there (see navigation/RootNavigator.js).
 */
export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const [companySlug, setCompanySlug] = useState('mirus');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = (companySlug.trim() || 'mirus') && identifier.trim() && password && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn({ companySlug: (companySlug.trim() || 'mirus'), identifier: identifier.trim(), password });
    } catch (err) {
      setError(err.uiMessage || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fillCredentials = (userEmail) => {
    setCompanySlug('mirus');
    setIdentifier(userEmail);
    setPassword('Reviewer@2026!');
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <BrandLogo variant="full" size={40} style={styles.logo} />

        <View style={styles.form}>
          <Text style={typography.label}>Company code</Text>
          <TextInput
            style={styles.input}
            value={companySlug}
            onChangeText={setCompanySlug}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. mirus"
            placeholderTextColor={colors.muted}
          />

          <Text style={[typography.label, styles.spacedLabel]}>Employee ID / Email</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Employee ID or email"
            placeholderTextColor={colors.muted}
          />

          <Text style={[typography.label, styles.spacedLabel]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor={colors.muted}
          />

          <ErrorBanner message={error} />

          <Button title="Log In" onPress={handleSubmit} loading={submitting} disabled={!canSubmit} style={styles.submit} />

          <View style={styles.demoBar}>
            <Text style={styles.demoBarLabel}>Reviewer / Demo Quick Access</Text>
            <View style={styles.demoButtons}>
              <Pressable
                onPress={() => fillCredentials('reviewer.bdm@mirus.com')}
                style={({ pressed }) => [styles.demoPill, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Fill BDM Field Force Test Credentials"
              >
                <Text style={styles.demoPillText}>Field Rep (BDM)</Text>
              </Pressable>
              <Pressable
                onPress={() => fillCredentials('reviewer.asm@mirus.com')}
                style={({ pressed }) => [styles.demoPill, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel="Fill ASM Manager Test Credentials"
              >
                <Text style={styles.demoPillText}>Manager (ASM)</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.legalContainer}>
            <Text style={styles.legalText}>
              By logging in, you agree to our{' '}
              <Text style={styles.legalLink} onPress={openTermsInBrowser}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={styles.legalLink}
                onPress={() => {
                  if (navigation?.navigate) {
                    navigation.navigate('PrivacyPolicy');
                  } else {
                    openPrivacyPolicyInBrowser();
                  }
                }}
              >
                Privacy Policy
              </Text>
              .
            </Text>

            <Pressable
              onPress={() => {
                if (navigation?.navigate) {
                  navigation.navigate('PrivacyPolicy');
                } else {
                  openPrivacyPolicyInBrowser();
                }
              }}
              style={({ pressed }) => [styles.privacyBadgeBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="View Privacy Policy and Data Safety Disclosures"
            >
              <Text style={styles.privacyBadgeText}>🔒 Privacy Policy & Data Safety</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  logo: { alignSelf: 'center', marginBottom: spacing.xxl },
  form: { gap: spacing.xs },
  spacedLabel: { marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface
  },
  submit: { marginTop: spacing.xl },
  legalContainer: {
    marginTop: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm
  },
  legalText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline'
  },
  privacyBadgeBtn: {
    marginTop: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  privacyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink
  },
  demoBar: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    gap: spacing.xs
  },
  demoBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  demoButtons: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  demoPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line
  },
  demoPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark
  }
});
