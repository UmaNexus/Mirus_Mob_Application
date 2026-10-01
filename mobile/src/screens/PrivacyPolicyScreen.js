import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, ExternalLink, Lock, Clock, Smartphone, Trash2, Mail, Users, ArrowLeft } from 'lucide-react-native';
import { PRIVACY_POLICY_URL, openPrivacyPolicyInBrowser, openAccountDeletionInBrowser } from '../config/legalUrls';
import Card from '../components/Card';
import Button from '../components/Button';
import BrandLogo from '../components/BrandLogo';
import { colors, spacing, radii, typography } from '../theme';

export default function PrivacyPolicyScreen({ navigation }) {
  const canGoBack = navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header bar */}
      <View style={styles.header}>
        {canGoBack && (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </Pressable>
        )}
        <BrandLogo variant="mark" size={24} />
        <View style={styles.headerText}>
          <Text style={typography.title}>Privacy Policy</Text>
          <Text style={styles.headerSubtitle}>MIRUS Field Force · Google Play Compliant</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Compliance Notice */}
        <Card style={styles.highlightCard}>
          <View style={styles.row}>
            <ShieldCheck size={22} color={colors.primary} />
            <Text style={styles.highlightTitle}>Official Privacy & Data Protection</Text>
          </View>
          <Text style={styles.highlightBody}>
            MIRUS Field Force is an enterprise workforce tool developed by UmaNexus for Mirus Med Sciences Pvt. Ltd.
            We respect your privacy and only process personal data necessary for workforce attendance, field activities,
            and operational security. We do NOT sell your data or use it for advertising.
          </Text>
          <Button
            icon={ExternalLink}
            title="Open Public Web Version"
            variant="outline"
            onPress={openPrivacyPolicyInBrowser}
            style={styles.webBtn}
          />
        </Card>

        {/* Section 1: Credentials */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Lock size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>1. User Credentials & Authentication</Text>
          </View>
          <Text style={styles.sectionBody}>
            • <Text style={styles.bold}>Collected Data:</Text> Company Code, Employee ID or Email Address, Password (one-way salted & hashed using bcrypt), and secure authentication session tokens (JWT).{'\n'}
            • <Text style={styles.bold}>Purpose:</Text> Strictly used for authenticating your identity, preventing unauthorized access, and determining user role permissions (BDM, Manager, Executive).{'\n'}
            • <Text style={styles.bold}>Security:</Text> Passwords are never stored in plaintext and cannot be read by administrators or staff. Tokens are stored in hardware-backed secure device storage (expo-secure-store).
          </Text>
        </Card>

        {/* Section 2: Attendance */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Clock size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>2. Attendance & Punch Tracking</Text>
          </View>
          <Text style={styles.sectionBody}>
            • <Text style={styles.bold}>Collected Data:</Text> Precise punch-in and punch-out timestamps (date, hour, minute), attendance status (Present, Absent, Leave, Half-Day, Holiday), total worked hours, and overtime.{'\n'}
            • <Text style={styles.bold}>Purpose:</Text> Essential workforce management functionality to calculate duty hours, verify shift completion, process payroll, and maintain statutory employment attendance records.
          </Text>
        </Card>

        {/* Section 3: Field Force Data */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Users size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>3. Field Activities & Call Reports</Text>
          </View>
          <Text style={styles.sectionBody}>
            • <Text style={styles.bold}>Collected Data:</Text> Daily Call Reports (DCR), Monthly Tour Plans (MTP), doctor visit notes, stockist meetings, and expense claim receipts uploaded by the user.{'\n'}
            • <Text style={styles.bold}>Purpose:</Text> Documenting pharmaceutical field visits, territory management, and expense claim reimbursements.
          </Text>
        </Card>

        {/* Section 4: Device & Push Notifications */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Smartphone size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>4. Device Info & Push Notifications</Text>
          </View>
          <Text style={styles.sectionBody}>
            • <Text style={styles.bold}>Collected Data:</Text> Device model, operating system version, and Firebase Cloud Messaging (FCM) / Expo push notification tokens.{'\n'}
            • <Text style={styles.bold}>Purpose:</Text> Delivering critical real-time alerts for leave approvals, tour plan authorizations, and administrative announcements. Device tokens are unlinked upon logout or device deregistration.
          </Text>
        </Card>

        {/* Section 5: Data Sharing */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <ShieldCheck size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>5. Data Sharing & Third Parties</Text>
          </View>
          <Text style={styles.sectionBody}>
            • We do <Text style={styles.bold}>NOT</Text> sell, monetize, or lease your personal data.{'\n'}
            • We do <Text style={styles.bold}>NOT</Text> share your data with advertisers or third-party data brokers.{'\n'}
            • Data is only shared with authorized infrastructure providers (Google Firebase for push notifications, encrypted cloud servers) and your employer (Mirus Med Sciences Pvt. Ltd.).
          </Text>
        </Card>

        {/* Section 6: Account Deletion */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Trash2 size={18} color={colors.danger} />
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>6. Account & Data Deletion</Text>
          </View>
          <Text style={styles.sectionBody}>
            In compliance with Google Play Developer Policy, you have the right to request deletion of your account and personal data.{'\n\n'}
            To request deletion, you can email our Data Protection Desk at <Text style={styles.bold}>privacy@umanexus.com</Text> or visit our dedicated web deletion request page below. Account credentials and profile data will be permanently wiped within 30 days, subject to mandatory statutory employment record retention rules.
          </Text>
          <Button
            title="Account Deletion Info"
            variant="outline"
            onPress={openAccountDeletionInBrowser}
            style={styles.delBtn}
          />
        </Card>

        {/* Section 7: Contact Info */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Mail size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>7. Contact Us & Grievances</Text>
          </View>
          <Text style={styles.sectionBody}>
            • <Text style={styles.bold}>Developer:</Text> UmaNexus{'\n'}
            • <Text style={styles.bold}>Organization:</Text> Mirus Med Sciences Pvt. Ltd.{'\n'}
            • <Text style={styles.bold}>Privacy Email:</Text> privacy@umanexus.com{'\n'}
            • <Text style={styles.bold}>Support Email:</Text> support@umanexus.com{'\n'}
            • <Text style={styles.bold}>Public URL:</Text> {PRIVACY_POLICY_URL}
          </Text>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Package: com.umanexus.fieldforce</Text>
          <Text style={styles.footerText}>Last Updated: October 1, 2026</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  backBtn: {
    paddingRight: spacing.xs,
    paddingVertical: 4
  },
  backBtnPressed: {
    opacity: 0.6
  },
  headerText: {
    flex: 1
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md
  },
  highlightCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1,
    gap: spacing.sm
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDark
  },
  highlightBody: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18
  },
  webBtn: {
    marginTop: spacing.xs
  },
  sectionCard: {
    gap: spacing.xs
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink
  },
  sectionBody: {
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19
  },
  bold: {
    fontWeight: '700',
    color: colors.ink
  },
  delBtn: {
    marginTop: spacing.xs,
    borderColor: colors.dangerSoft
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    gap: 2
  },
  footerText: {
    fontSize: 11,
    color: colors.muted
  }
});
