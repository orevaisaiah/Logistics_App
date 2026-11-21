import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { api } from './api'

export type PushStatus = 'unknown' | 'ready' | 'denied' | 'unavailable' | 'failed'

type NotificationsModule = typeof import('expo-notifications')

// Loaded only when needed and guarded, so a build that cannot do push (Expo Go is one) carries on
// without it instead of crashing. Deliveries then arrive only while the app is open.
async function load(): Promise<NotificationsModule | null> {
  try {
    return await import('expo-notifications')
  } catch {
    return null
  }
}

let registeredToken: string | null = null

// Asks permission, gets this phone's push address, and tells the server. Safe to call every time the app opens.
export async function setUpPush(): Promise<PushStatus> {
  const N = await load()
  if (!N) return 'unavailable'
  try {
    // While the app is open on screen, the offer card and the vibration already tell the rider,
    // so no banner or sound is added on top of them.
    N.setNotificationHandler({
      handleNotification: async () =>
        ({ shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }) as never,
    })

    if (Platform.OS === 'android') {
      // The channels must exist before permission is requested on Android 13 and newer
      await N.setNotificationChannelAsync('offers', {
        name: 'New deliveries',
        importance: N.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        sound: 'default',
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      })
      await N.setNotificationChannelAsync('default', { name: 'Updates', importance: N.AndroidImportance.HIGH })
    }

    const existing = await N.getPermissionsAsync()
    let status = existing.status
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status
    if (status !== 'granted') return 'denied'

    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
    const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId
    const pushToken = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)

    await api('/v1/rider/push-token', {
      method: 'POST',
      body: { token: pushToken.data, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    })
    registeredToken = pushToken.data
    return 'ready'
  } catch (err) {
    // Expo Go on Android cannot receive remote notifications (since SDK 53). Expo reports that as an error.
    return err instanceof Error && /expo go|development build/i.test(err.message) ? 'unavailable' : 'failed'
  }
}

// Called when the rider signs out, so alerts for this account stop reaching this phone
export async function removePushToken(): Promise<void> {
  const token = registeredToken
  registeredToken = null
  if (token) await api('/v1/rider/push-token/remove', { method: 'POST', body: { token } })
}

// onReceived: a notification arrived while the app is open. onTapped: the rider tapped one.
export async function listenForPush(handlers: { onReceived: () => void; onTapped: () => void }): Promise<() => void> {
  const N = await load()
  if (!N) return () => undefined
  try {
    const received = N.addNotificationReceivedListener(() => handlers.onReceived())
    const tapped = N.addNotificationResponseReceivedListener(() => handlers.onTapped())
    return () => {
      received.remove()
      tapped.remove()
    }
  } catch {
    return () => undefined
  }
}
