import React from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { Atmosphere } from '@/src/components/primitives';
import type { AppTheme } from '@/src/theme/theme';
import { themes } from '@/src/theme/theme';

export function LoadingScreen({
  headline = 'ClearHear',
  subtitle = 'Getting things ready.',
  theme = themes.light,
}: {
  headline?: string;
  subtitle?: string;
  theme?: AppTheme;
}) {
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <Atmosphere theme={theme} />
      <SafeAreaView style={styles.center}>
        <View style={[styles.mark, { backgroundColor: theme.card, borderColor: theme.border }]}> 
          <View style={[styles.markHalo, { backgroundColor: theme.accentSoft }]} />
          <View style={[styles.markDot, { backgroundColor: theme.accent }]} />
        </View>
        <Text style={[styles.headline, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>{headline}</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{subtitle}</Text>
        <ActivityIndicator color={theme.accent} size="small" />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  mark: {
    width: 66,
    height: 66,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markHalo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  markDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
  headline: {
    fontSize: 34,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
