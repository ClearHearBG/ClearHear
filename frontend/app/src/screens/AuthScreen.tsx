import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Atmosphere, SurfaceCard } from '@/src/components/primitives';
import { useAppState } from '@/src/state/AppProvider';

type AuthMode = 'signIn' | 'signUp';

export function AuthScreen() {
  const { isAuthenticating, signIn, theme } = useAppState();
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [fullName, setFullName] = useState('Mihal');
  const [email, setEmail] = useState('mihal@clearhear.app');
  const [password, setPassword] = useState('password123');

  const title = useMemo(() => (mode === 'signIn' ? 'Sign in' : 'Create account'), [mode]);

  const handleContinue = async () => {
    const derivedName = fullName.trim() || email.split('@')[0] || 'ClearHear User';
    await signIn(derivedName, email);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <Atmosphere theme={theme} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.container}>
            <View style={styles.brandBlock}>
              <Text style={[styles.brand, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>ClearHear</Text>
              <Text style={[styles.tagline, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Hearing support through your headphones.</Text>
            </View>

            <SurfaceCard style={styles.card} theme={theme}>
              <View style={[styles.modeSwitch, { backgroundColor: theme.elevated }]}> 
                <ModeButton active={mode === 'signIn'} label="Sign in" onPress={() => setMode('signIn')} theme={theme} />
                <ModeButton active={mode === 'signUp'} label="Sign up" onPress={() => setMode('signUp')} theme={theme} />
              </View>

              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>{title}</Text>
              </View>

              <View style={styles.form}>
                {mode === 'signUp' ? (
                  <Field
                    label="Full name"
                    onChangeText={setFullName}
                    theme={theme}
                    value={fullName}
                  />
                ) : null}

                <Field
                  autoCapitalize="none"
                  keyboardType="email-address"
                  label="Email"
                  onChangeText={setEmail}
                  theme={theme}
                  value={email}
                />

                <Field
                  autoCapitalize="none"
                  label="Password"
                  onChangeText={setPassword}
                  secureTextEntry
                  theme={theme}
                  value={password}
                />
              </View>

              {mode === 'signIn' ? (
                <Pressable style={styles.linkWrap}>
                  <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fonts.bodySemiBold }]}>Forgot password?</Text>
                </Pressable>
              ) : null}

              <ActionButton
                disabled={isAuthenticating}
                label={isAuthenticating ? 'Please wait...' : title}
                onPress={() => {
                  void handleContinue();
                }}
                theme={theme}
              />

              <View style={styles.switchRow}>
                <Text style={[styles.switchText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
                  {mode === 'signIn' ? 'New here?' : 'Already have an account?'}
                </Text>
                <Pressable
                  onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                  style={({ pressed }) => [styles.linkWrap, { opacity: pressed ? 0.75 : 1 }]}>
                  <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fonts.bodySemiBold }]}>
                    {mode === 'signIn' ? 'Sign up' : 'Sign in'}
                  </Text>
                </Pressable>
              </View>
            </SurfaceCard>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function ModeButton({
  active,
  label,
  onPress,
  theme,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeButton,
        {
          backgroundColor: active ? theme.card : 'transparent',
          borderColor: active ? theme.border : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text
        style={[
          styles.modeText,
          {
            color: active ? theme.text : theme.textMuted,
            fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.bodyMedium,
          },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  theme,
  value,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  theme: ReturnType<typeof useAppState>['theme'];
  value: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
      <TextInput
        placeholder={label}
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.input,
            borderColor: theme.border,
            color: theme.text,
            fontFamily: theme.fonts.bodyMedium,
          },
        ]}
        value={value}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 28,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 8,
  },
  brand: {
    fontSize: 36,
    lineHeight: 40,
  },
  tagline: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    gap: 20,
  },
  modeSwitch: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 18,
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: {
    fontSize: 14,
    lineHeight: 18,
  },
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
  },
  form: {
    gap: 14,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  linkWrap: {
    alignSelf: 'flex-start',
  },
  link: {
    fontSize: 14,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  switchText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
