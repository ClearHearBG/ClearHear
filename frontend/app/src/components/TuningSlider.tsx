import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/src/theme/theme';

export function TuningSlider({
  helper,
  label,
  max,
  min,
  onChange,
  step,
  theme,
  value,
  valueFormatter,
}: {
  helper: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  theme: AppTheme;
  value: number;
  valueFormatter: (value: number) => string;
}) {
  const trackWidth = useRef(1);

  const clampValue = useCallback(
    (nextValue: number) => {
      const safeValue = Math.max(min, Math.min(max, nextValue));
      const steppedValue = Math.round((safeValue - min) / step) * step + min;
      return Number(Math.max(min, Math.min(max, steppedValue)).toFixed(3));
    },
    [max, min, step],
  );

  const updateFromLocation = useCallback(
    (locationX: number) => {
      const ratio = Math.max(0, Math.min(1, locationX / Math.max(trackWidth.current, 1)));
      onChange(clampValue(min + ratio * (max - min)));
    },
    [clampValue, max, min, onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          updateFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          updateFromLocation(event.nativeEvent.locationX);
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [updateFromLocation],
  );

  const fillRatio = Math.max(0, Math.min(1, (value - min) / (max - min)));

  return (
    <View style={styles.sliderBlock}>
      <View style={styles.rowBetween}>
        <Text style={[styles.sliderLabel, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{label}</Text>
        <Text style={[styles.sliderValue, { color: theme.accent, fontFamily: theme.fonts.bodyBold }]}>{valueFormatter(value)}</Text>
      </View>
      <Text style={[styles.sliderHelper, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{helper}</Text>
      <View
        onLayout={(event) => {
          trackWidth.current = event.nativeEvent.layout.width;
        }}
        style={[styles.sliderTrack, { backgroundColor: theme.progressTrack, borderColor: theme.border }]}
        {...panResponder.panHandlers}>
        <View style={[styles.sliderFill, { width: `${fillRatio * 100}%`, backgroundColor: theme.accent }]} />
        <View
          style={[
            styles.sliderThumb,
            {
              backgroundColor: theme.card,
              borderColor: theme.accent,
              left: `${fillRatio * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.sliderRangeRow}>
        <Text style={[styles.sliderRangeLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{valueFormatter(min)}</Text>
        <Text style={[styles.sliderRangeLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{valueFormatter(max)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderBlock: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sliderLabel: {
    fontSize: 16,
    lineHeight: 20,
  },
  sliderValue: {
    fontSize: 15,
    lineHeight: 20,
  },
  sliderHelper: {
    fontSize: 13,
    lineHeight: 20,
  },
  sliderTrack: {
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 999,
  },
  sliderThumb: {
    position: 'absolute',
    top: -4,
    width: 26,
    height: 26,
    marginLeft: -13,
    borderRadius: 999,
    borderWidth: 3,
  },
  sliderRangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sliderRangeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
});
