import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '../../context/ThemeContext';
import { useAudio, TranscriptEntry } from '../../context/AudioContext';
import { Colors } from '../../constants/colors';

function TranscriptCard({
  entry,
  index,
  isDark,
}: {
  entry: TranscriptEntry;
  index: number;
  isDark: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const cardBg = isDark ? Colors.cardBgDark : Colors.cardBg;
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Animated.View
      style={[
        styles.transcriptCard,
        { backgroundColor: cardBg },
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.dot, { backgroundColor: Colors.green }]} />
        <Text style={[styles.timestamp, { color: secondaryText }]}>
          {formatTime(entry.timestamp)}
        </Text>
      </View>
      <Text style={[styles.transcriptText, { color: textColor }]}>{entry.text}</Text>
    </Animated.View>
  );
}

export default function TranscriptScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { transcripts, liveText, isListening, clearTranscripts } = useAudio();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const liveAnim = useRef(new Animated.Value(1)).current;

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const inputBg = isDark ? Colors.brownLight : Colors.sandLight + '40';

  useEffect(() => {
    if (liveText) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(liveAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(liveAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [liveText, liveAnim]);

  const filtered = searchQuery
    ? transcripts.filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : transcripts;

  const handleClear = () => {
    Alert.alert(
      'Clear Transcript',
      'Are you sure you want to delete all transcript entries?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearTranscripts },
      ]
    );
  };

  const handleExport = () => {
    Alert.alert('Export', 'Transcript copied to clipboard!');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/HomeScreen')}
          style={styles.backBtn}
        >
          <Text style={[styles.backIcon, { color: textColor }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Transcript</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setIsSearching(!isSearching)} style={styles.iconBtn}>
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExport} style={styles.iconBtn}>
            <Text style={{ fontSize: 18 }}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSearching && (
        <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
          <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search transcripts..."
            placeholderTextColor={secondaryText}
            style={[styles.searchInput, { color: textColor }]}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={{ color: secondaryText, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.bufferBanner, { backgroundColor: Colors.teal + '20' }]}>
        <Text style={[styles.bufferText, { color: Colors.teal }]}>
          📼 5-minute rolling buffer active
          {isListening ? ' · Recording...' : ''}
        </Text>
      </View>

      {isListening && liveText ? (
        <Animated.View
          style={[styles.liveCard, { backgroundColor: Colors.green + '20', opacity: liveAnim }]}
        >
          <View style={styles.liveDot} />
          <Text style={[styles.liveLabel, { color: Colors.greenDark }]}>Live</Text>
          <Text style={[styles.liveText, { color: textColor }]}>{liveText}</Text>
        </Animated.View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎙</Text>
            <Text style={[styles.emptyTitle, { color: textColor }]}>
              {searchQuery ? 'No results found' : 'No transcripts yet'}
            </Text>
            <Text style={[styles.emptyDesc, { color: secondaryText }]}>
              {searchQuery
                ? 'Try a different search term'
                : 'Start listening to capture and transcribe speech'}
            </Text>
          </View>
        ) : (
          filtered.map((entry, i) => (
            <TranscriptCard key={entry.id} entry={entry} index={i} isDark={isDark} />
          ))
        )}
      </ScrollView>

      {transcripts.length > 0 && (
        <View style={[styles.bottomBar, { backgroundColor: bg }]}>
          <Text style={[styles.countText, { color: secondaryText }]}>
            {filtered.length} entries
          </Text>
          <TouchableOpacity
            onPress={handleClear}
            style={[styles.clearBtn, { borderColor: Colors.danger + '60' }]}
          >
            <Text style={[styles.clearText, { color: Colors.danger }]}>Clear All</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 12,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 22, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '800' },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15 },
  bufferBanner: {
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  bufferText: { fontSize: 12, fontWeight: '600' },
  liveCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: Colors.green + '60',
  },
  liveDot: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.green,
  },
  liveLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    marginLeft: 18,
  },
  liveText: { fontSize: 15, lineHeight: 22 },
  list: { paddingHorizontal: 20, paddingBottom: 80 },
  transcriptCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  timestamp: { fontSize: 11, fontWeight: '500' },
  transcriptText: { fontSize: 15, lineHeight: 22 },
  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  countText: { fontSize: 13 },
  clearBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  clearText: { fontSize: 13, fontWeight: '600' },
});