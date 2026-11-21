import * as SecureStore from 'expo-secure-store'
import type { TokenStore } from './lib/session'

// The phone's secure storage (Keychain on iPhone, Keystore on Android). Tokens are never kept in plain storage.
const ACCESS = 'lg_rider_access'
const REFRESH = 'lg_rider_refresh'

export const secureTokenStore: TokenStore = {
  async read() {
    const [accessToken, refreshToken] = await Promise.all([SecureStore.getItemAsync(ACCESS), SecureStore.getItemAsync(REFRESH)])
    return accessToken && refreshToken ? { accessToken, refreshToken } : null
  },
  async write(tokens) {
    await Promise.all([SecureStore.setItemAsync(ACCESS, tokens.accessToken), SecureStore.setItemAsync(REFRESH, tokens.refreshToken)])
  },
  async clear() {
    await Promise.all([SecureStore.deleteItemAsync(ACCESS), SecureStore.deleteItemAsync(REFRESH)])
  },
}
