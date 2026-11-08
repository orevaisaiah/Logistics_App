import type { ReactNode } from 'react'
import { SessionProvider } from '@/components/SessionProvider'
import Shell from '@/components/Shell'

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  )
}
