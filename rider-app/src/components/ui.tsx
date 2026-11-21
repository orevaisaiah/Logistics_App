import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { toneColors, useTheme, type Tone } from '../theme'

export function Screen({ children, scroll = true, refreshing, onRefresh }: { children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const content = <View style={{ padding: 16, gap: 14 }}>{children}</View>
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  )
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme()
  return <Text style={{ fontSize: 24, fontWeight: '700', color: t.text }}>{children}</Text>
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme()
  return <Text style={{ fontSize: 17, fontWeight: '700', color: t.text }}>{children}</Text>
}

export function Body({ children, bold }: { children: ReactNode; bold?: boolean }) {
  const t = useTheme()
  return <Text style={{ fontSize: 16, color: t.text, fontWeight: bold ? '700' : '400' }}>{children}</Text>
}

export function Muted({ children, small }: { children: ReactNode; small?: boolean }) {
  const t = useTheme()
  return <Text style={{ fontSize: small ? 13 : 15, color: t.muted }}>{children}</Text>
}

export function Card({ children, tone }: { children: ReactNode; tone?: Tone }) {
  const t = useTheme()
  const border = tone ? toneColors(t, tone).fg : t.border
  return <View style={{ backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: border, padding: 16, gap: 10 }}>{children}</View>
}

export function Row({ children, between, wrap }: { children: ReactNode; between?: boolean; wrap?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: between ? 'space-between' : 'flex-start', flexWrap: wrap ? 'wrap' : 'nowrap' }}>{children}</View>
}

export function Divider() {
  const t = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border }} />
}

export function Banner({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme()
  const c = toneColors(t, tone)
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 10, padding: 12 }} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Text style={{ color: c.fg, fontSize: 15 }}>{children}</Text>
    </View>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme()
  const c = toneColors(t, tone)
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '700' }}>{children}</Text>
    </View>
  )
}

export function Spinner({ label }: { label?: string }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
      <ActivityIndicator color={t.primary} />
      {label ? <Muted>{label}</Muted> : null}
    </View>
  )
}

type ButtonProps = {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  loading?: boolean
  disabled?: boolean
  small?: boolean
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, small }: ButtonProps) {
  const t = useTheme()
  const off = disabled || loading
  const colors = {
    primary: { bg: t.primary, fg: t.primaryText, border: t.primary },
    secondary: { bg: t.surface, fg: t.text, border: t.border },
    danger: { bg: t.dangerBg, fg: t.danger, border: t.danger },
    ghost: { bg: 'transparent', fg: t.muted, border: 'transparent' },
  }[variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: small ? 8 : 14,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: off ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={colors.fg} /> : <Text style={{ color: colors.fg, fontSize: small ? 14 : 16, fontWeight: '700' }}>{title}</Text>}
    </Pressable>
  )
}

type FieldProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder?: string
  keyboardType?: KeyboardTypeOptions
  hint?: string
  error?: string | null
} & Pick<TextInputProps, 'secureTextEntry' | 'multiline' | 'maxLength' | 'autoCapitalize' | 'editable' | 'autoComplete' | 'textContentType'>

export function Field({ label, value, onChangeText, placeholder, keyboardType, hint, error, ...rest }: FieldProps) {
  const t = useTheme()
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        style={{
          borderWidth: 1,
          borderColor: error ? t.danger : t.border,
          borderRadius: 10,
          backgroundColor: t.surface,
          color: t.text,
          paddingHorizontal: 12,
          paddingVertical: rest.multiline ? 10 : 12,
          fontSize: 16,
          minHeight: rest.multiline ? 80 : undefined,
          textAlignVertical: rest.multiline ? 'top' : 'center',
        }}
        {...rest}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : hint ? <Muted small>{hint}</Muted> : null}
    </View>
  )
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: active ? t.primary : t.border, backgroundColor: active ? t.primary : t.surface }}
          >
            <Text style={{ color: active ? t.primaryText : t.text, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// A bottom sheet with a list of choices, for things like "why are you declining?"
export function ChoiceSheet({ visible, title, options, onChoose, onClose }: { visible: boolean; title: string; options: { value: string; label: string }[]; onChoose: (value: string) => void; onClose: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: t.surface, padding: 16, paddingBottom: insets.bottom + 16, gap: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <Heading>{title}</Heading>
        {options.map((o) => (
          <Button key={o.value} title={o.label} variant="secondary" onPress={() => onChoose(o.value)} />
        ))}
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  )
}

// Runs an async action, tracks that it is busy, and hands back any error message
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}
