import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { useInterval } from '../hooks/useInterval'
import { listenForPush, setUpPush, type PushStatus } from '../push'
import { useTheme } from '../theme'
import type { Me } from '../types'
import AccountScreen from './AccountScreen'
import EarningsScreen from './EarningsScreen'
import WorkScreen from './WorkScreen'

const TABS = [
  { key: 'work', label: 'Work' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'account', label: 'Account' },
] as const

export default function MainTabs({ me }: { me: Me }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { refreshMe } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('work')
  const [push, setPush] = useState<PushStatus>('unknown')
  const [pollSignal, setPollSignal] = useState(0)

  // Register this phone for notifications every time the app opens
  useEffect(() => {
    let cancelled = false
    void setUpPush().then((status) => {
      if (!cancelled) setPush(status)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // A notification means something changed: look for it straight away instead of waiting for the next check
  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    void listenForPush({
      onReceived: () => setPollSignal((n) => n + 1),
      onTapped: () => {
        setTab('work')
        setPollSignal((n) => n + 1)
      },
    }).then((remove) => {
      if (cancelled) remove()
      else stop = remove
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  // Notice quickly if the account is suspended while the rider is working
  useInterval(() => void refreshMe(), 60_000)

  // All three screens stay mounted, so the Work screen keeps checking for offers and sharing the location while another tab is open
  const pane = (key: string) => ({ flex: 1, display: tab === key ? ('flex' as const) : ('none' as const) })

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={pane('work')}>
        <WorkScreen me={me} pollSignal={pollSignal} push={push} />
      </View>
      <View style={pane('earnings')}>
        <EarningsScreen />
      </View>
      <View style={pane('account')}>
        <AccountScreen me={me} />
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, paddingBottom: insets.bottom }}>
        {TABS.map((item) => {
          const active = tab === item.key
          return (
            <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ color: active ? t.primary : t.muted, fontWeight: active ? '800' : '600', fontSize: 15 }}>{item.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
