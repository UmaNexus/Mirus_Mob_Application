import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAsync } from '../hooks/useAsync';
import { useRefreshOnFocus } from '../hooks/useRefreshOnFocus';
import * as attendanceApi from '../api/attendance';
import Card from './Card';
import Button from './Button';
import ErrorBanner from './ErrorBanner';
import { colors, spacing, typography } from '../theme';

/**
 * Self-service Punch In/Out card — available to every role except
 * Admin/superadmin (who manage the organization rather than punch their own
 * attendance here; `GET/POST /api/attendance/*` already enforce this
 * server-side via `requireNonAdmin`, this component is just the shared UI).
 * Real timestamped state from the backend, never fabricated locally.
 * Shared by the BDM, Manager (ASM/RSM/ZSM, and the HR/plain-employee
 * fallback), and Executive (NSM) home screens so the exact same
 * behavior/copy appears everywhere it's used.
 */
export default function PunchCard() {
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchError, setPunchError] = useState(null);
  const today = useAsync(attendanceApi.getToday, []);
  useRefreshOnFocus(today.reload);

  const handlePunch = async () => {
    setPunchError(null);
    setPunchBusy(true);
    try {
      if (today.data?.punchInAt && !today.data?.punchOutAt) {
        await attendanceApi.punchOut();
      } else {
        await attendanceApi.punchIn();
      }
      await today.reload();
    } catch (err) {
      setPunchError(err.uiMessage || err.message);
    } finally {
      setPunchBusy(false);
    }
  };

  const activeLeave = today.data?.activeLeave;
  const isOnLeaveToday = Boolean(activeLeave || today.data?.status === 'Leave');
  const punchedIn = Boolean(today.data?.punchInAt && !today.data?.punchOutAt);

  return (
    <Card>
      <View style={styles.row}>
        <View>
          <Text style={typography.label}>Attendance</Text>
          {today.status === 'loading' ? (
            <Text style={styles.muted}>Checking…</Text>
          ) : isOnLeaveToday && !punchedIn ? (
            <Text style={[styles.status, { color: colors.warning }]}>On Leave Today</Text>
          ) : (
            <Text style={[styles.status, { color: punchedIn ? colors.success : colors.danger }]}>
              {punchedIn ? `Punched in at ${new Date(today.data.punchInAt).toLocaleTimeString()}` : 'Not punched in'}
            </Text>
          )}
        </View>
        <Button
          title={punchedIn ? 'Punch Out' : 'Punch In'}
          variant={punchedIn ? 'danger' : 'primary'}
          loading={punchBusy}
          disabled={today.status === 'loading' || (isOnLeaveToday && !punchedIn)}
          onPress={handlePunch}
          style={styles.btn}
        />
      </View>
      <ErrorBanner message={punchError} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  muted: { fontSize: 13, color: colors.muted, marginTop: 2 },
  btn: { minWidth: 120 }
});
