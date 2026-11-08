import { Spinner } from '@/components/ui'

export default function Loading() {
  return (
    <div className="center-screen">
      <Spinner label="Looking up your delivery" />
    </div>
  )
}