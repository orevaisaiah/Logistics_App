import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import { Spinner } from './src/components/ui'
import LoginScreen from './src/screens/LoginScreen'
import MainTabs from './src/screens/MainTabs'
import OnboardingScreen from './src/screens/OnboardingScreen'
import { useTheme } from './src/theme'

function Root() {
  const { state } = useAuth()
  const t = useTheme()

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <Spinner label="Starting" />
      </View>
    )
  }
  if (state.status === 'signedOut') return <LoginScreen notice={state.notice} />

  // Only approved riders can work. Everyone else is taken through (or back to) getting approved.
  return state.me.rider?.verificationStatus === 'APPROVED' ? <MainTabs me={state.me} /> : <OnboardingScreen me={state.me} />
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
