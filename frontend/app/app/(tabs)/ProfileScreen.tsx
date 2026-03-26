import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/colors';

const HEARING_PROFILES = [
  { id: 'mild', name: 'Mild Loss', description: '25–40 dB', icon: '🔉' },
  { id: 'moderate', name: 'Moderate', description: '40–55 dB', icon: '🔊' },
  { id: 'severe', name: 'Severe', description: '55–70 dB', icon: '📢' },
  { id: 'custom', name: 'Custom', description: 'Your profile', icon: '🎯' },
];

const ENVIRONMENTS = [
  { id: 'quiet', name: 'Quiet Room', icon: '🏠' },
  { id: 'office', name: 'Office', icon: '💼' },
  { id: 'outdoor', name: 'Outdoor', icon: '🌿' },
  { id: 'noisy', name: 'Noisy Place', icon: '🏙' },
];

function ToggleRow({
  label,
  description,
  value,
  onChange,
  isDark,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, { color: isDark ? Colors.textDark : Colors.text }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.toggleDesc,
            { color: isDark ? Colors.textSecondaryDark : Colors.textSecondary },
          ]}
        >
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.border, true: Colors.teal + '80' }}
        thumbColor={value ? Colors.teal : Colors.sandLight}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const [activeProfile, setActiveProfile] = useState('custom');
  const [activeEnv, setActiveEnv] = useState('quiet');
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [backgroundProcessing, setBackgroundProcessing] = useState(false);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [saveHistory, setSaveHistory] = useState(true);
  const [notifications, setNotifications] = useState(false);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const cardBg = isDark ? Colors.cardBgDark : Colors.cardBg;
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

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
          <Text style={[styles.title, { color: textColor }]}>Profile & Settings</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: Colors.teal + '30' }]}>
            <Text style={{ fontSize: 40 }}>👤</Text>
          </View>
          <Text style={[styles.userName, { color: textColor }]}>Your Profile</Text>
          <Text style={[styles.userDesc, { color: secondaryText }]}>
            Personalized hearing enhancement
          </Text>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Hearing Profile</Text>
          <View style={styles.profileGrid}>
            {HEARING_PROFILES.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setActiveProfile(p.id)}
                style={[
                  styles.profileCard,
                  {
                    backgroundColor:
                      activeProfile === p.id
                        ? Colors.teal
                        : isDark
                          ? Colors.brownLight
                          : Colors.sandLight + '40',
                    borderColor: activeProfile === p.id ? Colors.teal : 'transparent',
                  },
                ]}
              >
                <Text style={styles.profileIcon}>{p.icon}</Text>
                <Text
                  style={[
                    styles.profileName,
                    { color: activeProfile === p.id ? Colors.white : textColor },
                  ]}
                >
                  {p.name}
                </Text>
                <Text
                  style={[
                    styles.profileDesc,
                    {
                      color:
                        activeProfile === p.id
                          ? Colors.white + '90'
                          : secondaryText,
                    },
                  ]}
                >
                  {p.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Environment</Text>
          <View style={styles.envRow}>
            {ENVIRONMENTS.map((e) => (
              <TouchableOpacity
                key={e.id}
                onPress={() => setActiveEnv(e.id)}
                style={[
                  styles.envBtn,
                  {
                    backgroundColor:
                      activeEnv === e.id
                        ? Colors.green + '30'
                        : isDark
                          ? Colors.brownLight
                          : Colors.sandLight + '30',
                    borderColor: activeEnv === e.id ? Colors.green : 'transparent',
                  },
                ]}
              >
                <Text style={styles.envIcon}>{e.icon}</Text>
                <Text style={[styles.envName, { color: textColor, fontSize: 10 }]}>
                  {e.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>App Settings</Text>

          <ToggleRow
            label="Auto Enhance"
            description="Automatically apply enhancements when listening"
            value={autoEnhance}
            onChange={setAutoEnhance}
            isDark={isDark}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <ToggleRow
            label="Background Processing"
            description="Continue enhancement when app is minimized"
            value={backgroundProcessing}
            onChange={setBackgroundProcessing}
            isDark={isDark}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <ToggleRow
            label="Haptic Feedback"
            description="Vibration feedback for controls"
            value={hapticFeedback}
            onChange={setHapticFeedback}
            isDark={isDark}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <ToggleRow
            label="Save History"
            description="Keep transcript history between sessions"
            value={saveHistory}
            onChange={setSaveHistory}
            isDark={isDark}
          />
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <ToggleRow
            label="Notifications"
            description="Get alerts when buffer is almost full"
            value={notifications}
            onChange={setNotifications}
            isDark={isDark}
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Appearance</Text>
          <View style={styles.themeRow}>
            <Text style={[styles.themeLabel, { color: textColor }]}>
              {isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
            </Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: Colors.border, true: Colors.teal + '80' }}
              thumbColor={isDark ? Colors.teal : Colors.sandLight}
            />
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>About</Text>
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: secondaryText }]}>Version</Text>
            <Text style={[styles.aboutValue, { color: textColor }]}>1.0.0</Text>
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: secondaryText }]}>Buffer Duration</Text>
            <Text style={[styles.aboutValue, { color: textColor }]}>5 minutes</Text>
          </View>
          <View
            style={[
              styles.divider,
              { backgroundColor: isDark ? Colors.brownLight : Colors.border },
            ]}
          />
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Privacy',
                'All audio processing is done on-device. No audio data is sent to external servers.'
              )
            }
          >
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: Colors.teal }]}>Privacy Policy</Text>
              <Text style={{ color: Colors.teal }}>→</Text>
            </View>
          </TouchableOpacity>
        </View>
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
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  userName: { fontSize: 20, fontWeight: '700' },
  userDesc: { fontSize: 13, marginTop: 4 },
  sectionCard: { borderRadius: 20, padding: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 16 },
  profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  profileCard: {
    width: '47%',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    alignItems: 'flex-start',
  },
  profileIcon: { fontSize: 22, marginBottom: 6 },
  profileName: { fontSize: 13, fontWeight: '700' },
  profileDesc: { fontSize: 11, marginTop: 2 },
  envRow: { flexDirection: 'row', gap: 8 },
  envBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    gap: 4,
  },
  envIcon: { fontSize: 20 },
  envName: { fontWeight: '600', textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleDesc: { fontSize: 11, marginTop: 2 },
  divider: { height: 1, marginVertical: 10 },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeLabel: { fontSize: 15, fontWeight: '600' },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aboutLabel: { fontSize: 14 },
  aboutValue: { fontSize: 14, fontWeight: '600' },
});