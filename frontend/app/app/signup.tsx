import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, isLoaded } = useSignUp();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  const onSignUpPress = useCallback(async () => {
    if (!isLoaded) return;

    try {
      setPending(true);

      await signUp.create({
        emailAddress,
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      router.push('/verify-email');
      
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.errors?.[0]?.longMessage || 'Please try again.');
    } finally {
      setPending(false);
    }
  }, [isLoaded, signUp, emailAddress, password]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign up</Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          value={emailAddress}
          onChangeText={setEmailAddress}
        />

        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.button} onPress={onSignUpPress} disabled={pending}>
          <Text style={styles.buttonText}>{pending ? 'Creating account...' : 'Sign up'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signin')} style={styles.link}>
          <Text style={{ textAlign: 'center' }}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  content: { gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#111',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { marginTop: 8, textAlign: 'center' },
});