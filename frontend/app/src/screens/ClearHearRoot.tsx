import { useAuth } from '@clerk/clerk-expo';
import React, { useEffect, useState } from 'react';
 
import { useAppState } from '@/src/state/AppProvider';
import { AuthScreen } from '@/src/screens/AuthScreen';
import { EarTestFlow } from '@/src/screens/EarTestFlow';
import { LoadingScreen } from '@/src/screens/LoadingScreen';
import { MainPager } from '@/src/screens/MainPager';
import { themes } from '@/src/theme/theme';
 
export function ClearHearRoot() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isReady, needsEarTest } = useAppState();
  const [showEntrySplash, setShowEntrySplash] = useState(true);
 
  useEffect(() => {
    if (!isLoaded || !isReady) return;
 
    if (isSignedIn) {
      setShowEntrySplash(false);
      return;
    }
 
    setShowEntrySplash(true);
    const timeout = setTimeout(() => setShowEntrySplash(false), 1100);
    return () => clearTimeout(timeout);
  }, [isLoaded, isReady, isSignedIn]);
 
  if (!isLoaded || !isReady) {
    return <LoadingScreen subtitle="Loading ClearHear." theme={themes.light} />;
  }
 
  if (!isSignedIn && showEntrySplash) {
    return <LoadingScreen subtitle="Preparing your app." theme={themes.light} />;
  }
 
  if (!isSignedIn) {
    return <AuthScreen />;
  }
 
  if (needsEarTest) {
    return <EarTestFlow />;
  }
 
  return <MainPager />;
}
