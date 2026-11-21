import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { API_URL } from '../config'
import { useAuth } from '../context/AuthContext'
import { adviceForAddress } from '../lib/connection'
import { Banner, Body, Button, Card, Field, Muted, Row, Screen, Title, useAction } from '../components/ui'

const RESEND_SECONDS = 30

export default function LoginScreen({ notice }: { notice?: string }) {
  const { requestCode, verifyCode } = useAuth()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const send = useAction()
  const verify = useAction()
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'done'; ok?: boolean; text?: string }>({ state: 'idle' })

  // Counts down until a new code may be requested
  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [secondsLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Asks the server whether it is awake, and explains in plain words what to do if it is not
  async function checkConnection() {
    setCheck({ state: 'checking' })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal })
      if (res.ok) setCheck({ state: 'done', ok: true, text: `Connected. The server at ${API_URL} answered.` })
      else setCheck({ state: 'done', ok: false, text: `The server answered with an error (${res.status}). Look in the API window for red messages.` })
    } catch {
      const advice = adviceForAddress(API_URL)
      setCheck({
        state: 'done',
        ok: false,
        text: `Could not reach ${API_URL}. ${advice ?? 'Check that the API window is running, that this phone is on the same Wi-Fi as the computer, and that Windows allows Node.js on private networks.'}`,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  async function sendCode() {
    const ok = await send.run(() => requestCode(phone.trim()))
    if (ok) {
      setStep('code')
      setSecondsLeft(RESEND_SECONDS)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Title>Ride with us</Title>
        <Muted>Deliver packages and get paid straight to your wallet.</Muted>
        {notice ? <Banner tone="warning">{notice}</Banner> : null}

        {step === 'phone' ? (
          <Card>
            <Body bold>Your phone number</Body>
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08031234567" autoComplete="tel" hint="We will text you a 6-digit code." />
            {send.error ? <Banner tone="danger">{send.error}</Banner> : null}
            <Button title="Send code" onPress={() => void sendCode()} loading={send.busy} disabled={phone.trim().length < 10} />
          </Card>
        ) : (
          <Card>
            <Body bold>Enter the code we sent to {phone}</Body>
            <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" />
            <Field label="Your full name (new riders only)" value={fullName} onChangeText={setFullName} autoCapitalize="words" placeholder="Chidi Eze" />
            {verify.error ? <Banner tone="danger">{verify.error}</Banner> : null}
            <Button title="Continue" onPress={() => void verify.run(() => verifyCode(phone.trim(), code, fullName))} loading={verify.busy} disabled={code.length !== 6} />
            <Row between>
              <Button small variant="ghost" title="Use a different number" onPress={() => { setStep('phone'); setCode(''); verify.setError(null) }} />
              <Button small variant="ghost" title={secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'} disabled={secondsLeft > 0 || send.busy} onPress={() => void sendCode()} />
            </Row>
          </Card>
        )}
        <Card>
          <Muted small>{`Server: ${API_URL}`}</Muted>
          {check.state === 'done' && check.text ? <Banner tone={check.ok ? 'success' : 'danger'}>{check.text}</Banner> : null}
          <Button small variant="secondary" title="Check connection" onPress={() => void checkConnection()} loading={check.state === 'checking'} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  )
}
