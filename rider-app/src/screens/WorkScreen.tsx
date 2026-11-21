import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Linking, Vibration } from 'react-native'
import { useKeepAwake } from 'expo-keep-awake'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { POLL_JOB_MS, POLL_OFFER_MS } from '../config'
import { useInterval, useNow } from '../hooks/useInterval'
import { getCurrentCoords, LocationDeniedError, useLocationSharing } from '../hooks/useLocation'
import { formatNaira } from '../lib/format'
import type { PushStatus } from '../push'
import type { Job, Me, Offer } from '../types'
import { Banner, Body, Button, Card, Heading, Muted, Screen, Spinner, Title, useAction } from '../components/ui'
import JobCard from './JobCard'
import OfferCard from './OfferCard'

type LiveOffer = Offer & { expiresAtMs: number }

// Keeps the phone's screen from sleeping while the rider is working
function StayAwake() {
  useKeepAwake()
  return null
}

export default function WorkScreen({ me, pollSignal, push }: { me: Me; pollSignal: number; push: PushStatus }) {
  const { refreshMe } = useAuth()
  const [online, setOnline] = useState(me.rider?.isOnline ?? false)
  const [offer, setOffer] = useState<LiveOffer | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null)
  const toggle = useAction()
  const finishedByRider = useRef(false)
  const lastOfferSeen = useRef<string | null>(null)
  const hadJob = useRef(false)

  // While working, share the phone's position with the server
  const working = online || job !== null
  const sharing = useLocationSharing(working)
  const now = useNow(working || offer !== null)

  const pollJob = useCallback(async () => {
    try {
      const result = await api<{ job: Job | null }>('/v1/rider/jobs/current')
      setJob(result.job)
      // The job vanished without the rider finishing it: the business or support cancelled or moved it
      if (hadJob.current && !result.job && !finishedByRider.current) {
        setNotice({ tone: 'warning', text: 'The delivery you were on was cancelled or given to someone else.' })
      }
      if (!result.job) finishedByRider.current = false
      hadJob.current = result.job !== null
    } catch {
      // a missed check is fine, the next one runs in a few seconds
    }
  }, [])

  const pollOffer = useCallback(async () => {
    try {
      const result = await api<{ offer: Offer | null }>('/v1/rider/offers/current')
      const next = result.offer
      if (!next) {
        setOffer(null)
        return
      }
      setOffer((previous) => (previous && previous.assignmentId === next.assignmentId ? previous : { ...next, expiresAtMs: Date.now() + next.secondsLeft * 1000 }))
      if (lastOfferSeen.current !== next.assignmentId) {
        lastOfferSeen.current = next.assignmentId
        Vibration.vibrate([0, 500, 250, 500])
      }
    } catch {
      // a missed check is fine
    }
  }, [])

  useEffect(() => {
    void pollJob()
    void pollOffer()
  }, [pollJob, pollOffer])

  // When the rider comes back to the app, check straight away instead of waiting for the next tick
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void pollJob()
        void pollOffer()
      }
    })
    return () => subscription.remove()
  }, [pollJob, pollOffer])

  useInterval(() => void pollJob(), POLL_JOB_MS)
  useInterval(() => void pollOffer(), online && !job ? POLL_OFFER_MS : null)

  // A push notification arrived: check for the offer or job change immediately
  useEffect(() => {
    if (pollSignal > 0) {
      void pollJob()
      void pollOffer()
    }
  }, [pollSignal, pollJob, pollOffer])

  async function goOnline() {
    setNotice(null)
    await toggle.run(async () => {
      try {
        const here = await getCurrentCoords()
        await api('/v1/rider/status', { method: 'POST', body: { online: true, lat: here.latitude, lng: here.longitude } })
        setOnline(true)
        void refreshMe()
      } catch (err) {
        if (err instanceof LocationDeniedError) {
          Alert.alert('Location is off', err.message, [{ text: 'Not now', style: 'cancel' }, { text: 'Open settings', onPress: () => void Linking.openSettings() }])
        }
        throw err
      }
    })
  }

  async function goOffline() {
    setNotice(null)
    await toggle.run(async () => {
      await api('/v1/rider/status', { method: 'POST', body: { online: false } })
      setOnline(false)
      setOffer(null)
      void refreshMe()
    })
  }

  const confirmOffline = () => {
    if (job) {
      Alert.alert('You are on a delivery', 'Going offline will not cancel it. Finish the delivery first.', [{ text: 'OK' }])
      return
    }
    void goOffline()
  }

  function finished(kind: 'delivered' | 'failed' | 'cancelled', payout: number) {
    finishedByRider.current = true
    if (kind === 'delivered') setNotice({ tone: 'success', text: `Delivered! ${formatNaira(payout)} has been added to your wallet.` })
    if (kind === 'failed') setNotice({ tone: 'warning', text: 'The delivery was marked as not completed. Our team will follow up.' })
    if (kind === 'cancelled') setNotice({ tone: 'warning', text: 'You gave the delivery back. It will go to another rider.' })
  }

  return (
    <Screen>
      {working ? <StayAwake /> : null}
      <Title>Work</Title>

      {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
      {toggle.error ? <Banner tone="danger">{toggle.error}</Banner> : null}
      {sharing.problem ? <Banner tone="warning">{sharing.problem}</Banner> : null}
      {push === 'denied' ? <Banner tone="warning">Notifications are off, so you will not hear about new deliveries when the app is closed. Turn them on for this app in your phone settings.</Banner> : null}
      {push === 'failed' ? <Banner tone="warning">Could not set up notifications. You will only get new deliveries while the app is open.</Banner> : null}
      {push === 'unavailable' && online ? <Banner tone="info">Notifications need the installed Rider app, not Expo Go. For now, keep the app open on screen to receive deliveries.</Banner> : null}

      <Card tone={online ? 'success' : undefined}>
        <Heading>{online ? 'You are online' : 'You are offline'}</Heading>
        <Muted>{online ? 'Keep this app open on screen so we can see where you are and send you deliveries.' : 'Go online to start receiving deliveries near you.'}</Muted>
        {online ? (
          <Button title="Go offline" variant="secondary" onPress={confirmOffline} loading={toggle.busy} />
        ) : (
          <Button title="Go online" onPress={() => void goOnline()} loading={toggle.busy} />
        )}
        {working && sharing.lastSentAt ? <Muted small>{`Location shared ${Math.max(0, Math.round((now - sharing.lastSentAt) / 1000))} seconds ago`}</Muted> : null}
      </Card>

      {job ? (
        <JobCard job={job} latest={sharing.latest} onChange={setJob} onFinished={finished} />
      ) : online ? (
        offer ? (
          <OfferCard offer={offer} nowMs={now} onAccepted={(accepted) => { setJob(accepted); hadJob.current = true; setOffer(null); setNotice(null) }} onGone={() => { setOffer(null); void pollOffer() }} />
        ) : (
          <Card>
            <Spinner label="Looking for deliveries near you..." />
            <Muted small>When one comes in, the phone will vibrate. You have about 30 seconds to accept.</Muted>
          </Card>
        )
      ) : (
        <Card>
          <Body>No active delivery.</Body>
        </Card>
      )}
    </Screen>
  )
}

