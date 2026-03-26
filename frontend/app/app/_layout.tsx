import { ThemeProvider } from '@react-navigation/native';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import 'react-native-reanimated';

import { AppProvider, useAppState } from '@/src/state/AppProvider';

void SplashScreen.preventAutoHideAsync();

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
    <AppProvider>
      <RootNavigator />
    </AppProvider>
  );
}
