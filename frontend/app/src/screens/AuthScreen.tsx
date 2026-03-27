import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import React, { useState } from 'react';
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
  const { theme } = useAppState();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
 
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
 
  const resetError = () => setError(null);
 
  const handleSignIn = async () => {
    if (!signInLoaded || !signIn) return;
    setLoading(true);
    resetError();
    try {
      const result = await signIn.create({ identifier: email.trim(), password });
      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
      } else {
        setError('Sign in could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      const msg = extractClerkError(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };
 
  const handleSignUp = async () => {
    if (!signUpLoaded || !signUp) return;
    setLoading(true);
    resetError();
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: fullName.trim().split(' ')[0] ?? '',
        lastName: fullName.trim().split(' ').slice(1).join(' ') || undefined,
      });
      // Send the verification email
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const msg = extractClerkError(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };
 
  const handleVerify = async () => {
    if (!signUpLoaded || !signUp) return;
    setLoading(true);
    resetError();
    try {
      const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else {
        setError('Verification could not be completed. Please try again.');
      }
    } catch (err: unknown) {
      const msg = extractClerkError(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };
 
  const handleContinue = () => {
    if (mode === 'signIn') {
      void handleSignIn();
    } else if (pendingVerification) {
      void handleVerify();
    } else {
      void handleSignUp();
    }
  };
 
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setPendingVerification(false);
    setError(null);
    setCode('');
  };
 
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Atmosphere theme={theme} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.container}>
            <View style={styles.brandBlock}>
              <Text style={[styles.brand, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>ClearHear</Text>
              <Text style={[styles.tagline, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
                Hearing support through your headphones.
              </Text>
            </View>
 
            <SurfaceCard style={styles.card} theme={theme}>
              {/* Mode switch — hidden while verifying */}
              {!pendingVerification && (
                <View style={[styles.modeSwitch, { backgroundColor: theme.elevated }]}>
                  <ModeButton active={mode === 'signIn'} label="Sign in" onPress={() => switchMode('signIn')} theme={theme} />
                  <ModeButton active={mode === 'signUp'} label="Sign up" onPress={() => switchMode('signUp')} theme={theme} />
                </View>
              )}
 
              {/* Title */}
              <View style={styles.header}>
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>
                  {pendingVerification ? 'Check your email' : mode === 'signIn' ? 'Sign in' : 'Create account'}
                </Text>
                {pendingVerification && (
                  <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
                    We sent a 6-digit code to{' '}
                    <Text style={{ color: theme.text, fontFamily: theme.fonts.bodySemiBold }}>{email.trim()}</Text>.
                    Enter it below to verify your account.
                  </Text>
                )}
              </View>
 
              {/* Form fields */}
              {pendingVerification ? (
                <View style={styles.form}>
                  <Field
                    autoCapitalize="none"
                    keyboardType="number-pad"
                    label="Verification code"
                    onChangeText={setCode}
                    theme={theme}
                    value={code}
                  />
                </View>
              ) : (
                <View style={styles.form}>
                  {mode === 'signUp' && (
                    <Field label="Full name" onChangeText={setFullName} theme={theme} value={fullName} />
                  )}
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
              )}
 
              {error ? (
                <Text style={[styles.errorText, { color: theme.danger, fontFamily: theme.fonts.bodyMedium }]}>
                  {error}
                </Text>
              ) : null}
 
              {mode === 'signIn' && !pendingVerification && (
                <Pressable style={styles.linkWrap}>
                  <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fonts.bodySemiBold }]}>
                    Forgot password?
                  </Text>
                </Pressable>
              )}
 
              {pendingVerification && (
                <Pressable
                  style={styles.linkWrap}
                  onPress={async () => {
                    resetError();
                    try {
                      await signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
                    } catch (err: unknown) {
                      setError(extractClerkError(err));
                    }
                  }}>
                  <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fonts.bodySemiBold }]}>
                    Resend code
                  </Text>
                </Pressable>
              )}
 
              <ActionButton
                disabled={loading}
                label={
                  loading
                    ? 'Please wait...'
                    : pendingVerification
                    ? 'Verify email'
                    : mode === 'signIn'
                    ? 'Sign in'
                    : 'Create account'
                }
                onPress={handleContinue}
                theme={theme}
              />
 
              {/* Switch mode footer */}
              {!pendingVerification && (
                <View style={styles.switchRow}>
                  <Text style={[styles.switchText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
                    {mode === 'signIn' ? 'New here?' : 'Already have an account?'}
                  </Text>
                  <Pressable
                    onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                    style={({ pressed }) => [styles.linkWrap, { opacity: pressed ? 0.75 : 1 }]}>
                    <Text style={[styles.link, { color: theme.accent, fontFamily: theme.fonts.bodySemiBold }]}>
                      {mode === 'signIn' ? 'Sign up' : 'Sign in'}
                    </Text>
                  </Pressable>
                </View>
              )}
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

function extractClerkError(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const clerkErr = err as { errors: Array<{ message: string }> };
    return clerkErr.errors?.[0]?.message ?? 'An unexpected error occurred.';
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred.';
}
 
const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 28,
  },
  brandBlock: { alignItems: 'center', gap: 8 },
  brand: { fontSize: 36, lineHeight: 40 },
  tagline: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  card: { gap: 20 },
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
  modeText: { fontSize: 14, lineHeight: 18 },
  header: { gap: 6 },
  title: { fontSize: 28, lineHeight: 32 },
  subtitle: { fontSize: 14, lineHeight: 22 },
  form: { gap: 14 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontSize: 13, lineHeight: 18 },
  input: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  linkWrap: { alignSelf: 'flex-start' },
  link: { fontSize: 14, lineHeight: 18 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  switchText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 13, lineHeight: 18 },
});
