import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import type { AppTheme } from '@/src/theme/theme';

export function Atmosphere({ theme }: { theme: AppTheme }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.topGlow, { backgroundColor: theme.accentSoft }]} />
    </View>
  );
}

export function SurfaceCard({ theme, style, children }: { theme: AppTheme; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Pill({
  theme,
  label,
  accent = false,
  style,
}: {
  theme: AppTheme;
  label: string;
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: accent ? theme.accentSoft : theme.elevated,
          borderColor: accent ? 'transparent' : theme.border,
        },
        style,
      ]}>
      <Text
        style={[
          styles.pillText,
          {
            color: accent ? theme.accent : theme.textMuted,
            fontFamily: accent ? theme.fonts.bodySemiBold : theme.fonts.bodyMedium,
          },
        ]}>
        {label}
      </Text>
    </View>
  );
}

export function ActionButton({
  theme,
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: {
  theme: AppTheme;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';

  const backgroundColor = isPrimary
    ? theme.accent
    : isDanger
      ? theme.danger
      : variant === 'secondary'
        ? theme.elevated
        : 'transparent';

  const textColor = isPrimary || isDanger ? '#FFFFFF' : theme.text;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: variant === 'ghost' ? theme.border : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}>
      <View style={styles.buttonRow}>
        {icon ? <Feather color={textColor} name={icon} size={18} style={styles.buttonIcon} /> : null}
        <Text style={[styles.buttonText, { color: textColor, fontFamily: theme.fonts.bodyBold }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function DetailRow({
  theme,
  label,
  value,
  valueStyle,
}: {
  theme: AppTheme;
  label: string;
  value: string;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }, valueStyle]}>{value}</Text>
    </View>
  );
}

export function AnimatedEntrance({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, opacity, translateY]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  topGlow: {
    position: 'absolute',
    top: -110,
    alignSelf: 'center',
    width: 360,
    height: 220,
    borderRadius: 72,
    transform: [{ rotate: '-8deg' }],
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: {
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 16,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'right',
    flexShrink: 1,
  },
});
