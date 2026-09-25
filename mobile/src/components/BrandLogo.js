import React from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { colors, radii } from '../theme';

// Same official assets as the web app's BrandLogo (client/src/components/ui/BrandLogo.jsx,
// backed by client/public/logo-mirus*.png) — copied into mobile/assets/, never redrawn.
const FULL_LOGO = require('../../assets/logo-mirus.png');
const MARK_LOGO = require('../../assets/logo-mirus-mark.png');
const FULL_ASPECT = 1289 / 351; // wordmark's real width:height
const MARK_ASPECT = 352 / 238; // mark's real width:height

/**
 * Official Mirus brand logo.
 * `variant="full"` — the wide wordmark (dark navy text baked into the
 * image) — needs a light background, e.g. the Login screen.
 * `variant="mark"` — the icon-only mark (orange/gray, transparent) — works
 * on light or dark backgrounds. Pass `boxed` on a dark background to match
 * the web app's convention (a small white rounded box behind the mark).
 */
export default function BrandLogo({ variant = 'full', size = 32, boxed = false, style }) {
  if (variant === 'full') {
    return <Image source={FULL_LOGO} resizeMode="contain" style={[{ height: size, width: size * FULL_ASPECT }, style]} />;
  }

  const mark = <Image source={MARK_LOGO} resizeMode="contain" style={{ width: size, height: size / MARK_ASPECT }} />;
  if (!boxed) return <View style={style}>{mark}</View>;

  return (
    <View style={[styles.box, { width: size * 1.4, height: size * 1.4 }, style]}>
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
