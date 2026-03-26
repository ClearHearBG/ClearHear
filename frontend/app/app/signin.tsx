import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);

  const onSignInPress = useCallback(async () => {
    if (!isLoaded) return;

    try {
      setPending(true);

      const result = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)/HomeScreen');
      } else {
        Alert.alert('Sign in incomplete', 'Additional steps are required.');
      }
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.errors?.[0]?.longMessage || 'Please try again.');
    } finally {
      setPending(false);
    }
  }, [isLoaded, signIn, emailAddress, password, setActive, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Sign in</Text>

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

        <TouchableOpacity style={styles.button} onPress={onSignInPress} disabled={pending}>
          <Text style={styles.buttonText}>{pending ? 'Signing in...' : 'Sign in'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/signup')} style={styles.link}>
          <Text style={{ textAlign: 'center' }}>Create an account</Text>
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