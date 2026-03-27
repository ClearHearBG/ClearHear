import { ClerkProvider } from '@clerk/clerk-expo';
import { ThemeProvider } from '@react-navigation/native';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
 
import { AppProvider, useAppState } from '@/src/state/AppProvider';
import { clerkTokenCache } from '@/src/services/clerkTokenCache'
 
void SplashScreen.preventAutoHideAsync();
 
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY as string;
 
function RootNavigator() {
  const { navigationTheme, theme } = useAppState();
 
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="index" />
      </Stack>
      <StatusBar style={theme.statusBar} />
    </ThemeProvider>
  );
}
 
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
 
  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
 
  if (!fontsLoaded) {
    return null;
  }
 
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={clerkTokenCache}>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </ClerkProvider>
  );
}