import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useAsync } from '../hooks/useAsync';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import * as notificationsApi from '../api/notifications';
import { colors } from '../theme';

export default function NotificationBell({ onPress, color = colors.ink, size = 22 }) {
  const unreadCount = useAsync(notificationsApi.getUnreadCount, []);
  useRefreshOnFocus(unreadCount.reload);

  const count = unreadCount.data || 0;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.button}>
      <Bell size={size} color={color} />
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 6,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
