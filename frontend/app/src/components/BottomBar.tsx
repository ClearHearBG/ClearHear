import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppTheme } from '@/src/theme/theme';
import type { AppTab } from '@/src/types/app';

interface TabItem {
  key: AppTab;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}

export function BottomBar({
  theme,
  tabs,
  activeIndex,
  scrollX,
  onSelect,
}: {
  theme: AppTheme;
  tabs: TabItem[];
  activeIndex: number;
  scrollX: Animated.Value;
  onSelect: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [barWidth, setBarWidth] = useState(0);
  const itemWidth = useMemo(() => {
    const availableWidth = (barWidth || width - 32) - 12;

    return availableWidth / tabs.length;
  }, [barWidth, tabs.length, width]);

  const translateX = scrollX.interpolate({
    inputRange: tabs.map((_, index) => index * width),
    outputRange: tabs.map((_, index) => index * itemWidth),
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 14) }]}> 
      <View
        onLayout={(event) => {
          setBarWidth(event.nativeEvent.layout.width);
        }}
        style={[styles.inner, { backgroundColor: theme.tabBar, borderColor: theme.border, shadowColor: theme.shadow }]}> 
        <Animated.View
          style={[
            styles.indicator,
            {
              width: itemWidth,
              transform: [{ translateX }],
              backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.elevated,
              borderColor: theme.border,
            },
          ]}
        />

        {tabs.map((tab, index) => {
          const active = index === activeIndex;

          return (
            <Pressable key={tab.key} onPress={() => onSelect(index)} style={styles.tab}>
              <Feather color={active ? theme.accent : theme.tabIconMuted} name={tab.icon} size={18} />
              <Text
                style={[
                  styles.label,
                  {
                    color: active ? theme.text : theme.textMuted,
                    fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.bodyMedium,
                  },
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
  },
  inner: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    left: 6,
    top: 6,
    bottom: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
  },
});
