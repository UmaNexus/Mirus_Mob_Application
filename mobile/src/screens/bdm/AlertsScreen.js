import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Cake, Award, Clock3, CheckCheck, FileText, Receipt, Calendar, AlertCircle, ChevronRight } from 'lucide-react-native';
import { useAsync } from '../../hooks/useAsync';
import { useRefreshOnFocus } from '../../hooks/useRefreshOnFocus';
import * as fieldForceApi from '../../api/fieldForce';
import * as notificationsApi from '../../api/notifications';
import { handleNotificationNavigation } from '../../services/notificationService';
import Card from '../../components/Card';
import LoadingView from '../../components/LoadingView';
import ErrorBanner from '../../components/ErrorBanner';
import EmptyState from '../../components/EmptyState';
import { colors, spacing, typography, iconSizes, radii } from '../../theme';

const ICON_ALERTS = { birthday: Cake, anniversary: Award, expiry: Clock3 };

const MODULE_ICONS = {
  leave: FileText,
  expense: Receipt,
  mtp: Calendar,
  dcr: FileText,
  doctor: Cake,
  holiday: Calendar,
  attendance: Clock3,
  alert: AlertCircle,
  hierarchy: Bell,
  secondary_sales: Receipt,
};

export default function AlertsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' | 'alerts'

  const notifications = useAsync(notificationsApi.listNotifications, []);
  const alerts = useAsync(fieldForceApi.getAlerts, []);

  useRefreshOnFocus(notifications.reload);
  useRefreshOnFocus(alerts.reload);

  const onRefresh = () => {
    notifications.reload();
    alerts.reload();
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      notifications.reload();
    } catch (e) {
      console.warn('Failed to mark all as read', e);
    }
  };

  const handleNotificationPress = async (item) => {
    if (!item.isRead) {
      notificationsApi.markAsRead(item._id).catch(() => {});
    }

    handleNotificationNavigation(navigation, {
      eventId: item.eventId,
      screen: item.data?.screen,
      focus: item.data?.focus,
      deepLink: item.deepLink,
      tab: item.data?.tab,
      planId: item.data?.planId,
      reportId: item.data?.reportId,
      doctorId: item.data?.doctorId,
      leaveId: item.data?.leaveId,
      expenseId: item.data?.expenseId,
      ...item.data,
    });
  };

  const unreadCount = notifications.data?.pagination?.unreadCount || 0;
  const refreshing = notifications.status === 'loading' || alerts.status === 'loading';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={typography.title}>Notification Center</Text>
            <Text style={typography.subtitle}>Approvals, updates & alerts</Text>
          </View>
          {activeTab === 'notifications' && unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
              <CheckCheck size={16} color={colors.primary} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'notifications' && styles.tabButtonActive]}
            onPress={() => setActiveTab('notifications')}
          >
            <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>
              System ({unreadCount > 0 ? `${unreadCount} new` : 'All'})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'alerts' && styles.tabButtonActive]}
            onPress={() => setActiveTab('alerts')}
          >
            <Text style={[styles.tabText, activeTab === 'alerts' && styles.tabTextActive]}>
              Field Reminders ({(alerts.data || []).length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'notifications' ? (
        <>
          {notifications.status === 'error' && <ErrorBanner message={notifications.error} />}
          <FlatList
            contentContainerStyle={styles.list}
            data={notifications.data?.notifications || []}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              notifications.status === 'success' ? (
                <EmptyState icon={Bell} title="No notifications right now" />
              ) : null
            }
            renderItem={({ item }) => {
              const IconComponent = MODULE_ICONS[item.module] || Bell;
              return (
                <TouchableOpacity activeOpacity={0.7} onPress={() => handleNotificationPress(item)}>
                  <Card style={[styles.row, !item.isRead && styles.unreadRow]}>
                    <View style={[styles.iconContainer, !item.isRead && styles.unreadIconContainer]}>
                      <IconComponent size={20} color={!item.isRead ? colors.primary : colors.muted} />
                    </View>
                    <View style={styles.rowText}>
                      <View style={styles.titleRow}>
                        <Text style={[styles.name, !item.isRead && styles.unreadTitle]}>{item.title}</Text>
                        {!item.isRead && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.bodyText}>{item.body}</Text>
                      <Text style={styles.meta}>
                        {new Date(item.createdAt).toLocaleDateString()} ·{' '}
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </Card>
                </TouchableOpacity>
              );
            }}
          />
        </>
      ) : (
        <>
          {alerts.status === 'error' && <ErrorBanner message={alerts.error} />}
          <FlatList
            contentContainerStyle={styles.list}
            data={alerts.data || []}
            keyExtractor={(item, idx) => `${item.source}-${item.type}-${idx}`}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              alerts.status === 'success' ? (
                <EmptyState icon={Bell} title="No field alerts right now" />
              ) : null
            }
            renderItem={({ item }) => {
              const AlertIcon = ICON_ALERTS[item.type] || Bell;
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.type === 'birthday') {
                      navigation.navigate('HomeTab', {
                        screen: 'BdmHome',
                        params: { focus: 'todaysPlan', doctorId: item.doctorId },
                      });
                    }
                  }}
                >
                  <Card style={styles.row}>
                    <View style={styles.iconContainer}>
                      <AlertIcon size={20} color={colors.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>
                        {item.type} · {new Date(item.date).toLocaleDateString()}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.muted} />
                  </Card>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  markAllText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: radii.md,
    padding: 3,
    marginBottom: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.ink,
    fontWeight: '600',
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  unreadRow: { backgroundColor: '#F8FAFC', borderColor: colors.primary, borderWidth: 1 },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadIconContainer: {
    backgroundColor: '#E0EDFE',
  },
  rowText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  name: { fontSize: 14, fontWeight: '600', color: colors.ink },
  unreadTitle: { color: colors.primary, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  bodyText: { fontSize: 13, color: '#334155', marginBottom: 4, lineHeight: 18 },
  meta: { fontSize: 11, color: colors.muted, textTransform: 'capitalize' },
});
