import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import BrandLogo from '../components/BrandLogo';
import { colors, spacing } from '../theme';

/** Full-screen loader shown while auth state boots (checking stored token). */
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <BrandLogo variant="mark" size={56} style={styles.logo} />
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  logo: { marginBottom: spacing.xl }
});
