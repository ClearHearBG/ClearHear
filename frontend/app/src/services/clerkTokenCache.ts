import * as SecureStore from 'expo-secure-store';
import type { TokenCache } from '@clerk/clerk-expo';
 
const TOKEN_KEY_PREFIX = 'clerk_token_';
 
function sanitizeKey(key: string): string {
  // SecureStore keys must match [a-zA-Z0-9._-]
  return key.replace(/[^a-zA-Z0-9._-]/g, '_');
}
 
export const clerkTokenCache: TokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(sanitizeKey(TOKEN_KEY_PREFIX + key));
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(sanitizeKey(TOKEN_KEY_PREFIX + key), value);
    } catch {
      // ignore
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(sanitizeKey(TOKEN_KEY_PREFIX + key));
    } catch {
      // ignore
    }
  },
};