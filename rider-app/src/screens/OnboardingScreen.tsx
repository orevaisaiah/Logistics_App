import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { api, apiUpload } from '../api'
import { useAuth } from '../context/AuthContext'
import { useInterval } from '../hooks/useInterval'
import { useLoad } from '../hooks/useLoad'
import { DOCUMENT_LABELS, VEHICLE_LABELS } from '../lib/format'
import { isAccountNumber, validateDob } from '../lib/validate'
import type { Me, Onboarding } from '../types'
import { Badge, Banner, Body, Button, Card, Chips, Field, Heading, Muted, Row, Screen, Spinner, Title, useAction } from '../components/ui'

const VEHICLES = Object.keys(VEHICLE_LABELS).map((v) => ({ value: v, label: VEHICLE_LABELS[v] }))
const DOCUMENT_TYPES = ['ID', 'LICENCE', 'VEHICLE_PAPERS', 'SELFIE', 'GUARANTOR_FORM']

// "1995-03-12T00:00:00.000Z" -> "12/03/1995"
function dobToText(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

function ProfileCard({ data, onSaved }: { data: Onboarding; onSaved: () => void }) {
  const p = data.profile
  const [fullName, setFullName] = useState(p.fullName ?? '')
  const [dob, setDob] = useState(dobToText(p.dateOfBirth))
  const [address, setAddress] = useState(p.address ?? '')
  const [vehicle, setVehicle] = useState<string | null>(p.vehicleType)
  const [plate, setPlate] = useState(p.plateNumber ?? '')
  const [area, setArea] = useState(p.serviceArea ?? '')
  const save = useAction()
  const [saved, setSaved] = useState(false)

  async function submit() {
    setSaved(false)
    const ok = await save.run(async () => {
      const parsed = validateDob(dob, new Date())
      if ('error' in parsed) throw new Error(parsed.error)
      if (fullName.trim().length < 2) throw new Error('Enter your full name.')
      if (address.trim().length < 5) throw new Error('Enter your home address.')
      if (!vehicle) throw new Error('Choose your vehicle.')
      if (plate.trim().length < 3) throw new Error('Enter your plate number.')
      if (area.trim().length < 2) throw new Error('Enter the area or city where you will ride.')
      await api('/v1/rider/profile', {
        method: 'PATCH',
        body: { fullName: fullName.trim(), dateOfBirth: parsed.iso, address: address.trim(), vehicleType: vehicle, plateNumber: plate.trim(), serviceArea: area.trim() },
      })
    })
    if (ok) {
      setSaved(true)
      onSaved()
    }
  }

  return (
    <Card>
      <Row between>
        <Heading>1. About you and your vehicle</Heading>
        {data.profileComplete ? <Badge tone="success">Done</Badge> : null}
      </Row>
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Field label="Date of birth" value={dob} onChangeText={setDob} keyboardType="numbers-and-punctuation" placeholder="12/03/1995" hint="Day / month / year. You must be 18 or older." />
      <Field label="Home address" value={address} onChangeText={setAddress} multiline />
      <Body bold>Vehicle</Body>
      <Chips options={VEHICLES} value={vehicle} onChange={setVehicle} />
      <Field label="Plate number" value={plate} onChangeText={setPlate} autoCapitalize="characters" placeholder="ABC123XY" />
      <Field label="Area or city where you will ride" value={area} onChangeText={setArea} placeholder="Lagos Mainland" />
      {save.error ? <Banner tone="danger">{save.error}</Banner> : null}
      {saved ? <Banner tone="success">Saved.</Banner> : null}
      <Button title="Save" onPress={() => void submit()} loading={save.busy} />
    </Card>
  )
}

function BankCard({ data, onSaved }: { data: Onboarding; onSaved: () => void }) {
  const [bankName, setBankName] = useState(data.bank.bankName ?? '')
  const [accountNumber, setAccountNumber] = useState(data.bank.accountNumber ?? '')
  const [accountName, setAccountName] = useState(data.bank.accountName ?? '')
  const save = useAction()
  const [saved, setSaved] = useState(false)

  async function submit() {
    setSaved(false)
    const ok = await save.run(async () => {
      if (bankName.trim().length < 2) throw new Error('Enter the name of your bank.')
      if (!isAccountNumber(accountNumber)) throw new Error('Your account number has 10 digits.')
      if (accountName.trim().length < 2) throw new Error('Enter the name on the account.')
      await api('/v1/rider/bank', { method: 'PUT', body: { bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() } })
    })
    if (ok) {
      setSaved(true)
      onSaved()
    }
  }

  return (
    <Card>
      <Row between>
        <Heading>2. Where we pay you</Heading>
        {data.bankComplete ? <Badge tone="success">Done</Badge> : null}
      </Row>
      <Field label="Bank" value={bankName} onChangeText={setBankName} autoCapitalize="words" placeholder="GTBank" />
      <Field label="Account number" value={accountNumber} onChangeText={(v) => setAccountNumber(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={10} />
      <Field label="Name on the account" value={accountName} onChangeText={setAccountName} autoCapitalize="words" hint="It must match your own name. Withdrawals go only to this account." />
      {save.error ? <Banner tone="danger">{save.error}</Banner> : null}
      {saved ? <Banner tone="success">Saved.</Banner> : null}
      <Button title="Save" onPress={() => void submit()} loading={save.busy} />
    </Card>
  )
}

function DocumentsCard({ data, locked, onUploaded }: { data: Onboarding; locked: boolean; onUploaded: () => void }) {
  const upload = useAction()
  const [uploading, setUploading] = useState<string | null>(null)
  const uploadedCount = DOCUMENT_TYPES.filter((t) => {
    const status = data.documents.find((d) => d.type === t)?.status
    return status === 'PENDING' || status === 'APPROVED'
  }).length

  async function choose(type: string, source: 'camera' | 'library') {
    setUploading(type)
    await upload.run(async () => {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync()
        if (!permission.granted) throw new Error('Camera access is off. Turn it on in your phone settings, or choose a photo from your gallery.')
      }
      // A lower quality keeps the photo small enough to upload on a mobile connection
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ quality: 0.5 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.5 })
      if (result.canceled || result.assets.length === 0) return
      const asset = result.assets[0]
      const form = new FormData()
      form.append('file', { uri: asset.uri, name: asset.fileName ?? `${type.toLowerCase()}.jpg`, type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob)
      await apiUpload(`/v1/rider/documents/${type}`, form)
      onUploaded()
    })
    setUploading(null)
  }

  return (
    <Card>
      <Row between>
        <Heading>3. Your documents</Heading>
        <Badge tone={uploadedCount === DOCUMENT_TYPES.length ? 'success' : 'warning'}>{`${uploadedCount} of ${DOCUMENT_TYPES.length}`}</Badge>
      </Row>
      <Muted small>Take clear, well-lit photos where every corner and all the text can be read.</Muted>
      {upload.error ? <Banner tone="danger">{upload.error}</Banner> : null}
      {DOCUMENT_TYPES.map((type) => {
        const doc = data.documents.find((d) => d.type === type)
        const tone = doc?.status === 'APPROVED' ? 'success' : doc?.status === 'REJECTED' ? 'danger' : doc?.status === 'PENDING' ? 'info' : 'warning'
        const label = doc?.status === 'APPROVED' ? 'Approved' : doc?.status === 'REJECTED' ? 'Rejected: upload again' : doc?.status === 'PENDING' ? 'Uploaded' : 'Missing'
        return (
          <Card key={type} tone={doc?.status === 'REJECTED' ? 'danger' : undefined}>
            <Row between>
              <Body bold>{DOCUMENT_LABELS[type]}</Body>
              <Badge tone={tone}>{label}</Badge>
            </Row>
            {doc?.note ? <Muted small>Note from our team: {doc.note}</Muted> : null}
            {!locked && doc?.status !== 'APPROVED' ? (
              <Row>
                <Button small variant="secondary" title="Take photo" disabled={uploading !== null} loading={uploading === type} onPress={() => void choose(type, 'camera')} />
                <Button small variant="secondary" title="From gallery" disabled={uploading !== null} onPress={() => void choose(type, 'library')} />
              </Row>
            ) : null}
          </Card>
        )
      })}
    </Card>
  )
}

export default function OnboardingScreen({ me }: { me: Me }) {
  const { refreshMe, signOut } = useAuth()
  const onboarding = useLoad<Onboarding>('/v1/rider/onboarding')
  const submit = useAction()
  const data = onboarding.data

  const suspended = me.rider?.verificationStatus === 'SUSPENDED'
  const waiting = Boolean(data?.locked)

  // While the application is being reviewed, check every 20 seconds so approval shows up by itself
  useInterval(() => {
    onboarding.reload()
    void refreshMe()
  }, waiting ? 20_000 : null)

  // When the application changes state (for example it is rejected), make sure the account state is current too
  useEffect(() => {
    if (data && data.verificationStatus !== me.rider?.verificationStatus) void refreshMe()
  }, [data, me.rider?.verificationStatus, refreshMe])

  const refreshAll = () => {
    onboarding.reload()
    void refreshMe()
  }

  if (suspended) {
    return (
      <Screen>
        <Title>Account suspended</Title>
        <Banner tone="danger">Your rider account is suspended. Please contact support to find out why and what to do next.</Banner>
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen refreshing={onboarding.loading} onRefresh={refreshAll}>
        <Title>{waiting ? 'We are reviewing your application' : 'Get ready to ride'}</Title>

        {onboarding.loading && !data ? <Spinner label="Loading" /> : null}
        {onboarding.error ? <Banner tone="danger">{onboarding.error.message}</Banner> : null}

        {data ? (
          <>
            {waiting ? <Banner tone="info">Your details and documents are with our team. This usually takes a short while. This screen updates by itself when you are approved.</Banner> : null}
            {data.rejectionReason ? <Banner tone="danger">Your application was not approved: {data.rejectionReason}. Fix the problems below and submit again.</Banner> : null}

            {!waiting ? (
              <>
                <Muted>Complete the three steps, then send your application for review.</Muted>
                <ProfileCard data={data} onSaved={onboarding.reload} />
                <BankCard data={data} onSaved={onboarding.reload} />
              </>
            ) : null}

            <DocumentsCard data={data} locked={waiting} onUploaded={onboarding.reload} />

            {!waiting ? (
              <Card>
                <Heading>4. Send for review</Heading>
                <Body>{data.profileComplete ? '✓' : '○'} About you and your vehicle</Body>
                <Body>{data.bankComplete ? '✓' : '○'} Bank details</Body>
                <Body>{data.missingDocuments.length === 0 ? '✓' : '○'} All five documents{data.missingDocuments.length > 0 ? ` (${data.missingDocuments.length} still needed)` : ''}</Body>
                {submit.error ? <Banner tone="danger">{submit.error}</Banner> : null}
                <Button
                  title="Send application"
                  disabled={!data.canSubmit}
                  loading={submit.busy}
                  onPress={() =>
                    void submit.run(async () => {
                      await api('/v1/rider/submit', { method: 'POST' })
                      refreshAll()
                    }).catch(() => undefined)
                  }
                />
                <Muted small>After you send it, your details are locked while our team reviews them.</Muted>
              </Card>
            ) : null}
          </>
        ) : null}

        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </Screen>
    </KeyboardAvoidingView>
  )
}
