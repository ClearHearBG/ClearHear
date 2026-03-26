import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/src/components/primitives';
import type { AppTheme } from '@/src/theme/theme';
import type { EarSide, HearingPoint } from '@/src/types/app';

const GRAPH_HEIGHT = 232;
const MAX_LOSS_DB = 80;
const X_TICKS = [20, 125, 1000, 8000, 20000];
const Y_TICKS = [0, 20, 40, 60, 80];
const GRAPH_PADDING = {
  top: 18,
  right: 12,
  bottom: 34,
  left: 42,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compactFrequencyLabel(frequency: number): string {
  if (frequency >= 1000) {
    const value = frequency / 1000;
    return `${Number.isInteger(value) ? value : value.toFixed(1)}k`;
  }

  return `${frequency}`;
}

function frequencyRatio(frequency: number): number {
  const min = X_TICKS[0];
  const max = X_TICKS[X_TICKS.length - 1];
  return (Math.log(clamp(frequency, min, max)) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

function xPosition(frequency: number, width: number): number {
  return GRAPH_PADDING.left + frequencyRatio(frequency) * width;
}

function yPosition(lossDb: number, height: number): number {
  return GRAPH_PADDING.top + (clamp(lossDb, 0, MAX_LOSS_DB) / MAX_LOSS_DB) * height;
}

export function HearingResultsChart({ points, theme }: { points: HearingPoint[]; theme: AppTheme }) {
  const [chartWidth, setChartWidth] = useState(0);
  const innerWidth = Math.max(1, chartWidth - GRAPH_PADDING.left - GRAPH_PADDING.right);
  const innerHeight = GRAPH_HEIGHT - GRAPH_PADDING.top - GRAPH_PADDING.bottom;

  const series = useMemo(
    () => [
      {
        color: theme.accent,
        ear: 'left' as EarSide,
        points: points.filter((point) => point.ear === 'left').sort((first, second) => first.frequency - second.frequency),
      },
      {
        color: theme.secondary,
        ear: 'right' as EarSide,
        points: points.filter((point) => point.ear === 'right').sort((first, second) => first.frequency - second.frequency),
      },
    ],
    [points, theme.accent, theme.secondary],
  );

  return (
    <SurfaceCard style={styles.card} theme={theme}>
      <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Hearing map</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Estimated hearing loss by tested frequency for each ear.</Text>

      <View
        onLayout={(event) => {
          setChartWidth(event.nativeEvent.layout.width);
        }}
        style={[styles.graphFrame, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
        {Y_TICKS.map((tick) => {
          const top = yPosition(tick, innerHeight);

          return (
            <React.Fragment key={`y-${tick}`}>
              <View style={[styles.gridLine, { top, borderColor: theme.border }]} />
              <Text
                style={[
                  styles.yLabel,
                  {
                    top: top - 8,
                    color: theme.textMuted,
                    fontFamily: theme.fonts.bodyMedium,
                  },
                ]}>
                {tick}
              </Text>
            </React.Fragment>
          );
        })}

        {X_TICKS.map((tick) => {
          const left = xPosition(tick, innerWidth);

          return (
            <React.Fragment key={`x-${tick}`}>
              <View style={[styles.tickMark, { left, backgroundColor: theme.border }]} />
              <Text
                style={[
                  styles.xLabel,
                  {
                    left: left - 22,
                    color: theme.textMuted,
                    fontFamily: theme.fonts.bodyMedium,
                  },
                ]}>
                {compactFrequencyLabel(tick)}
              </Text>
            </React.Fragment>
          );
        })}

        {series.map((entry) =>
          entry.points.slice(1).map((point, index) => {
            const previous = entry.points[index];
            const x1 = xPosition(previous.frequency, innerWidth);
            const y1 = yPosition(previous.lossDb, innerHeight);
            const x2 = xPosition(point.frequency, innerWidth);
            const y2 = yPosition(point.lossDb, innerHeight);
            const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            const angle = Math.atan2(y2 - y1, x2 - x1);

            return (
              <View
                key={`${entry.ear}-segment-${previous.frequency}-${point.frequency}`}
                style={[
                  styles.seriesLine,
                  {
                    backgroundColor: entry.color,
                    left: (x1 + x2) / 2 - length / 2,
                    opacity: 0.36,
                    top: (y1 + y2) / 2 - 1,
                    transform: [{ rotateZ: `${angle}rad` }],
                    width: length,
                  },
                ]}
              />
            );
          }),
        )}

        {series.map((entry) =>
          entry.points.map((point) => {
            const left = xPosition(point.frequency, innerWidth) - 6;
            const top = yPosition(point.lossDb, innerHeight) - 6;

            return (
              <View
                key={`${entry.ear}-point-${point.frequency}-${point.lossDb}-${point.heard ? 'heard' : 'missed'}`}
                style={[
                  styles.point,
                  {
                    backgroundColor: point.heard ? entry.color : theme.card,
                    borderColor: entry.color,
                    left,
                    opacity: point.heard ? 1 : 0.76,
                    top,
                  },
                ]}
              />
            );
          }),
        )}

        <View style={[styles.axisY, { backgroundColor: theme.border }]} />
        <View style={[styles.axisX, { backgroundColor: theme.border }]} />

        <Text style={[styles.axisTitle, styles.axisTitleY, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>Loss dB</Text>
        <Text style={[styles.axisTitle, styles.axisTitleX, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>Frequency</Text>
      </View>

      <View style={styles.legendRow}>
        <LegendChip color={theme.accent} label="Left ear" theme={theme} />
        <LegendChip color={theme.secondary} label="Right ear" theme={theme} />
        <LegendChip color={theme.textMuted} hollow label="Not heard" theme={theme} />
      </View>
    </SurfaceCard>
  );
}

function LegendChip({
  color,
  hollow = false,
  label,
  theme,
}: {
  color: string;
  hollow?: boolean;
  label: string;
  theme: AppTheme;
}) {
  return (
    <View style={[styles.legendChip, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
      <View
        style={[
          styles.legendDot,
          {
            backgroundColor: hollow ? theme.card : color,
            borderColor: color,
          },
        ]}
      />
      <Text style={[styles.legendLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  graphFrame: {
    position: 'relative',
    height: GRAPH_HEIGHT,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: GRAPH_PADDING.left,
    right: GRAPH_PADDING.right,
    borderTopWidth: 1,
  },
  axisY: {
    position: 'absolute',
    left: GRAPH_PADDING.left,
    top: GRAPH_PADDING.top,
    bottom: GRAPH_PADDING.bottom,
    width: 1,
  },
  axisX: {
    position: 'absolute',
    left: GRAPH_PADDING.left,
    right: GRAPH_PADDING.right,
    bottom: GRAPH_PADDING.bottom,
    height: 1,
  },
  tickMark: {
    position: 'absolute',
    bottom: GRAPH_PADDING.bottom - 4,
    width: 1,
    height: 8,
  },
  xLabel: {
    position: 'absolute',
    bottom: 8,
    width: 44,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  yLabel: {
    position: 'absolute',
    left: 6,
    width: GRAPH_PADDING.left - 12,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  axisTitle: {
    position: 'absolute',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  axisTitleY: {
    left: 10,
    top: 8,
  },
  axisTitleX: {
    right: 14,
    bottom: 8,
  },
  seriesLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
  },
  point: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
  },
  legendLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
});
