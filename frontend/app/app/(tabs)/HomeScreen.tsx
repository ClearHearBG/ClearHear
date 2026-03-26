import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '../../context/ThemeContext';
import { useAudio } from '../../context/AudioContext';
import { Colors } from '../../constants/colors';

const FREQUENCY_BANDS = [
  { label: '125\nHz', key: 'bassBoost' as const, freq: 125 },
  { label: '500\nHz', key: 'midBoost' as const, freq: 500 },
  { label: '1\nkHz', key: 'highBoost' as const, freq: 1000 },
  { label: '2\nkHz', key: 'trebleBoost' as const, freq: 2000 },
  { label: '4\nkHz', key: 'clarity' as const, freq: 4000 },
  { label: '8\nkHz', key: 'noiseReduction' as const, freq: 8000 },
];

function WaveformBar({ active, delay }: { active: boolean; delay: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let loop: Animated.CompositeAnimation | undefined;

    if (active) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: Math.random() * 0.7 + 0.3,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: 200 + Math.random() * 300,
            useNativeDriver: false,
          }),
        ])
      );

      timeout = setTimeout(() => loop?.start(), delay);

      return () => {
        if (timeout) clearTimeout(timeout);
        loop?.stop();
      };
    } else {
      Animated.timing(anim, {
        toValue: 0.15,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [active, delay, anim]);

  return (
    <Animated.View
      style={{
        width: 3,
        marginHorizontal: 2,
        borderRadius: 2,
        backgroundColor: active ? Colors.green : Colors.sandLight,
        height: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [4, 48],
        }),
      }}
    />
  );
}

function EQSlider({
  label,
  value,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  isDark: boolean;
}) {
  const [localVal, setLocalVal] = useState(value);
  const barAnim = useRef(new Animated.Value(value)).current;
  const height = 100;

  useEffect(() => {
    setLocalVal(value);
    Animated.spring(barAnim, {
      toValue: value,
      useNativeDriver: false,
    }).start();
  }, [value, barAnim]);

  const handlePress = (e: any) => {
    const y = e.nativeEvent.locationY;
    const newVal = Math.max(0, Math.min(100, Math.round((1 - y / height) * 100)));
    setLocalVal(newVal);
    onChange(newVal);

    Animated.spring(barAnim, {
      toValue: newVal,
      useNativeDriver: false,
    }).start();
  };

  const fillHeight = barAnim.interpolate({
    inputRange: [0, 100],
    outputRange: [0, height],
  });

  return (
    <View style={styles.eqSliderContainer}>
      <View
        style={[
          styles.eqTrack,
          { height, backgroundColor: isDark ? Colors.brownLight : Colors.border },
        ]}
        onTouchEnd={handlePress}
      >
        <Animated.View
          style={[
            styles.eqFill,
            {
              height: fillHeight,
              backgroundColor:
                localVal > 60 ? Colors.green : localVal > 30 ? Colors.teal : Colors.mint,
            },
          ]}
        />
      </View>
      <Text style={[styles.eqLabel, { color: isDark ? Colors.sandLight : Colors.brown }]}>
        {label}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { isListening, audioSettings, updateSettings, startListening, stopListening } = useAudio();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.cardBgDark : Colors.cardBg;
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  useEffect(() => {
    let pulse: Animated.CompositeAnimation | undefined;
    let glow: Animated.CompositeAnimation | undefined;

    if (isListening) {
      pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );

      glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
        ])
      );

      pulse.start();
      glow.start();

      return () => {
        pulse?.stop();
        glow?.stop();
      };
    } else {
      Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [isListening, glowAnim, pulseAnim]);

  const handleToggle = () => {
    if (isListening) stopListening();
    else startListening();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.appName, { color: textColor }]}>ClearHear</Text>
            <Text style={[styles.tagline, { color: secondaryText }]}>
              Real-time speech enhancement
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)/AIScreen')}
            style={[styles.profileBtn, { backgroundColor: cardBg }]}
          >
            <Text style={{ fontSize: 20 }}>👤</Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            styles.waveformCard,
            { backgroundColor: isDark ? Colors.brownDark : Colors.brown },
          ]}
        >
          <View style={styles.waveformInner}>
            {Array.from({ length: 24 }).map((_, i) => (
              <WaveformBar key={i} active={isListening} delay={i * 50} />
            ))}
          </View>
          <Text style={[styles.waveformLabel, { color: Colors.sandLight }]}>
            {isListening ? 'Listening & Enhancing...' : 'Tap the button to start'}
          </Text>
        </View>

        <View style={styles.controlCenter}>
          <Animated.View
            style={[
              styles.btnGlowRing,
              {
                transform: [{ scale: pulseAnim }],
                shadowColor: Colors.green,
                shadowOpacity: isListening ? 0.6 : 0,
                shadowRadius: 30,
                elevation: isListening ? 20 : 0,
              },
            ]}
          >
            <TouchableOpacity
              onPress={handleToggle}
              style={[
                styles.mainBtn,
                {
                  backgroundColor: isListening ? Colors.green : Colors.teal,
                },
              ]}
              activeOpacity={0.85}
            >
              <Text style={styles.mainBtnIcon}>{isListening ? '⏹' : '🎙'}</Text>
              <Text style={styles.mainBtnText}>{isListening ? 'Stop' : 'Start'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: Colors.teal }]}>
              {audioSettings.noiseReduction}%
            </Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>Noise Reduction</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: Colors.green }]}>
              {audioSettings.clarity}%
            </Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>Clarity</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: Colors.teal }]}>5 min</Text>
            <Text style={[styles.statLabel, { color: secondaryText }]}>Buffer</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Equalizer</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/AIScreen')}>
              <Text style={[styles.seeAll, { color: Colors.teal }]}>Advanced →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.eqRow}>
            {FREQUENCY_BANDS.map((band) => (
              <EQSlider
                key={band.key}
                label={band.label}
                value={(audioSettings as any)[band.key] ?? 50}
                onChange={(v) => updateSettings({ [band.key]: v })}
                isDark={isDark}
              />
            ))}
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: cardBg }]}
            onPress={() => router.push('/(tabs)/TranscriptScreen')}
          >
            <Text style={styles.actionIcon}>📝</Text>
            <Text style={[styles.actionText, { color: textColor }]}>Transcript</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: cardBg }]}
            onPress={() => router.push('/(tabs)/AIScreen')}
          >
            <Text style={styles.actionIcon}>🤖</Text>
            <Text style={[styles.actionText, { color: textColor }]}>AI Assistant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: cardBg }]}
            onPress={() => router.push('/(tabs)/ControlsScreen')}
          >
            <Text style={styles.actionIcon}>🎛</Text>
            <Text style={[styles.actionText, { color: textColor }]}>Controls</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 30 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: { fontSize: 13, marginTop: 2 },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  waveformInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    marginBottom: 10,
  },
  waveformLabel: { fontSize: 13, opacity: 0.8 },
  controlCenter: { alignItems: 'center', marginBottom: 24 },
  btnGlowRing: {
    borderRadius: 50,
    shadowOffset: { width: 0, height: 0 },
  },
  mainBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  mainBtnIcon: { fontSize: 30, marginBottom: 2 },
  mainBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brownDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  sectionCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  seeAll: { fontSize: 13, fontWeight: '600' },
  eqRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 130,
  },
  eqSliderContainer: { alignItems: 'center', gap: 8 },
  eqTrack: {
    width: 28,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  eqFill: {
    width: '100%',
    borderRadius: 14,
  },
  eqLabel: {
    fontSize: 9,
    textAlign: 'center',
    fontWeight: '600',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: { fontSize: 24 },
  actionText: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
});