import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '../../context/ThemeContext';
import { useAudio } from '../../context/AudioContext';
import { Colors } from '../../constants/colors';

const { width } = Dimensions.get('window');
const SLIDER_WIDTH = width - 80;

function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
  color = Colors.teal,
  isDark,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  color?: string;
  isDark: boolean;
}) {
  const pct = (value - min) / (max - min);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, gs) => {
      const x = gs.moveX - 40;
      const newPct = Math.max(0, Math.min(1, x / SLIDER_WIDTH));
      const newVal = Math.round(min + newPct * (max - min));
      onChange(newVal);
    },
  });

  return (
    <View style={styles.sliderWrapper} {...panResponder.panHandlers}>
      <View
        style={[
          styles.sliderTrack,
          { backgroundColor: isDark ? Colors.brownLight : Colors.border },
        ]}
      >
        <View
          style={[
            styles.sliderFill,
            { width: `${pct * 100}%`, backgroundColor: color },
          ]}
        />
        <View
          style={[
            styles.sliderThumb,
            {
              left: `${pct * 100}%`,
              backgroundColor: Colors.white,
              borderColor: color,
              shadowColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function ControlRow({
  label,
  description,
  value,
  unit = '%',
  color,
  onChange,
  isDark,
}: {
  label: string;
  description: string;
  value: number;
  unit?: string;
  color: string;
  onChange: (v: number) => void;
  isDark: boolean;
}) {
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  return (
    <View style={styles.controlRow}>
      <View style={styles.controlInfo}>
        <View style={styles.controlLabelRow}>
          <Text style={[styles.controlLabel, { color: textColor }]}>{label}</Text>
          <View style={[styles.valueBadge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.valueText, { color }]}>
              {value}{unit}
            </Text>
          </View>
        </View>
        <Text style={[styles.controlDesc, { color: secondaryText }]}>{description}</Text>
      </View>
      <Slider value={value} onChange={onChange} color={color} isDark={isDark} />
    </View>
  );
}

const PRESETS = [
  { name: 'Speech Boost', icon: '🗣', settings: { bassBoost: 10, midBoost: 40, highBoost: 70, trebleBoost: 60, clarity: 85, noiseReduction: 75, volume: 80, compressionRatio: 60 } },
  { name: 'Music', icon: '🎵', settings: { bassBoost: 60, midBoost: 50, highBoost: 45, trebleBoost: 55, clarity: 60, noiseReduction: 40, volume: 80, compressionRatio: 30 } },
  { name: 'Conference', icon: '👥', settings: { bassBoost: 20, midBoost: 50, highBoost: 65, trebleBoost: 50, clarity: 90, noiseReduction: 85, volume: 85, compressionRatio: 70 } },
  { name: 'Outdoor', icon: '🌿', settings: { bassBoost: 15, midBoost: 45, highBoost: 60, trebleBoost: 55, clarity: 75, noiseReduction: 90, volume: 90, compressionRatio: 65 } },
];

export default function ControlsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { audioSettings, updateSettings } = useAudio();
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.cardBgDark : Colors.cardBg;
  const textColor = isDark ? Colors.textDark : Colors.text;

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setActivePreset(preset.name);
    updateSettings(preset.settings);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/HomeScreen')}
            style={styles.backBtn}
          >
            <Text style={[styles.backIcon, { color: textColor }]}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Audio Controls</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Quick Presets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
            {PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.name}
                onPress={() => applyPreset(preset)}
                style={[
                  styles.presetBtn,
                  {
                    backgroundColor:
                      activePreset === preset.name
                        ? Colors.teal
                        : isDark
                          ? Colors.brownLight
                          : Colors.sandLight + '50',
                    borderColor: activePreset === preset.name ? Colors.teal : 'transparent',
                  },
                ]}
              >
                <Text style={styles.presetIcon}>{preset.icon}</Text>
                <Text
                  style={[
                    styles.presetName,
                    { color: activePreset === preset.name ? Colors.white : textColor },
                  ]}
                >
                  {preset.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Volume & Dynamics</Text>

          <ControlRow
            label="Master Volume"
            description="Overall output level"
            value={audioSettings.volume}
            color={Colors.green}
            onChange={(v) => updateSettings({ volume: v })}
            isDark={isDark}
          />
          <ControlRow
            label="Compression"
            description="Dynamic range compression for consistent levels"
            value={audioSettings.compressionRatio}
            color={Colors.teal}
            onChange={(v) => updateSettings({ compressionRatio: v })}
            isDark={isDark}
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Enhancement</Text>

          <ControlRow
            label="Speech Clarity"
            description="Sharpens consonants and vowel differentiation"
            value={audioSettings.clarity}
            color={Colors.green}
            onChange={(v) => updateSettings({ clarity: v })}
            isDark={isDark}
          />
          <ControlRow
            label="Noise Reduction"
            description="Filters background noise and interference"
            value={audioSettings.noiseReduction}
            color={Colors.teal}
            onChange={(v) => updateSettings({ noiseReduction: v })}
            isDark={isDark}
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Frequency Equalizer</Text>

          <ControlRow
            label="Bass (125 Hz)"
            description="Low frequency response"
            value={audioSettings.bassBoost}
            color={Colors.sand}
            onChange={(v) => updateSettings({ bassBoost: v })}
            isDark={isDark}
          />
          <ControlRow
            label="Low-Mid (500 Hz)"
            description="Warmth and body"
            value={audioSettings.midBoost}
            color={Colors.sandLight}
            onChange={(v) => updateSettings({ midBoost: v })}
            isDark={isDark}
          />
          <ControlRow
            label="High-Mid (2 kHz)"
            description="Presence and intelligibility"
            value={audioSettings.highBoost}
            color={Colors.teal}
            onChange={(v) => updateSettings({ highBoost: v })}
            isDark={isDark}
          />
          <ControlRow
            label="Treble (8 kHz)"
            description="Air and definition"
            value={audioSettings.trebleBoost}
            color={Colors.green}
            onChange={(v) => updateSettings({ trebleBoost: v })}
            isDark={isDark}
          />
        </View>

        <TouchableOpacity
          style={[styles.resetBtn, { borderColor: Colors.danger + '60' }]}
          onPress={() => {
            setActivePreset(null);
            updateSettings({
              bassBoost: 0,
              midBoost: 3,
              highBoost: 5,
              trebleBoost: 2,
              clarity: 70,
              noiseReduction: 60,
              volume: 80,
              compressionRatio: 50,
            });
          }}
        >
          <Text style={[styles.resetText, { color: Colors.danger }]}>Reset to Defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    marginBottom: 20,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 22, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800' },
  sectionCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 16 },
  presetsScroll: { marginHorizontal: -4 },
  presetBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1.5,
  },
  presetIcon: { fontSize: 22, marginBottom: 4 },
  presetName: { fontSize: 12, fontWeight: '600' },
  controlRow: { marginBottom: 20 },
  controlInfo: { marginBottom: 8 },
  controlLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: { fontSize: 14, fontWeight: '600' },
  valueBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  valueText: { fontSize: 13, fontWeight: '700' },
  controlDesc: { fontSize: 11, marginTop: 2 },
  sliderWrapper: { height: 36, justifyContent: 'center' },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    position: 'relative',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    top: -8,
    marginLeft: -11,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  resetBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  resetText: { fontSize: 14, fontWeight: '600' },
});