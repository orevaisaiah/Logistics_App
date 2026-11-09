import type { DeliveryStatus } from './format'
import type { BoardRider } from './riders'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface Dashboard {
  today: { deliveriesCreated: number; byStatus: Record<string, number>; delivered: number; deliveredValue: number; commissionEarned: number }
  openDeliveries: Record<string, number>
  riders: { online: number; onJobs: number }
  needsAttention: {
    pendingRiderApplications: number
    pendingWithdrawals: { count: number; amount: number }
    deliveriesWaitingTooLong: number
    waitingTooLongMeansOver: string
    oldestWaiting: { id: string; trackingCode: string; waitingSeconds: number } | null
    failedDeliveriesAwaitingDecision: number
  }
}

export interface Board {
  generatedAt: string
  waiting: {
    id: string
    trackingCode: string
    vehicleType: string
    pickupAddress: string
    pickupLat: number
    pickupLng: number
    price: number
    waitingSeconds: number
    offersMade: number
    lastOffer: { status: string; offeredAt: string } | null
    business: { companyName: string }
  }[]
  inProgress: {
    id: string
    trackingCode: string
    status: DeliveryStatus
    assignedAt: string | null
    pickedUpAt: string | null
    rider: { id: string; user: { fullName: string | null; phone: string } } | null
  }[]
  riders: BoardRider[]
}

export interface DeliveryRow {
  id: string
  trackingCode: string
  status: DeliveryStatus
  vehicleType: string
  price: number
  commissionAmount: number
  riderPayoutAmount: number
  pickupAddress: string
  dropoffAddress: string
  createdAt: string
  business: { id: string; companyName: string }
  zone: { name: string }
}

export interface DeliveryDetail {
  id: string
  trackingCode: string
  status: DeliveryStatus
  vehicleType: string
  price: number
  commissionAmount: number
  riderPayoutAmount: number
  distanceKm: number
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  pickupContactName: string
  pickupContactPhone: string
  dropoffAddress: string
  recipientName: string
  recipientPhone: string
  packageDescription: string
  weightKg: number
  declaredValue: number | null
  isFragile: boolean
  notes: string | null
  riderId: string | null
  createdAt: string
  assignedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  chargedAt: string | null
  settledAt: string | null
  refundedAt: string | null
  business: { id: string; companyName: string }
  zone: { id: string; name: string }
  events: { id: string; status: DeliveryStatus; actorType: string; note: string | null; createdAt: string }[]
  assignments: {
    id: string
    status: string
    offeredAt: string
    respondedAt: string | null
    declineReason: string | null
    riderId: string
    rider: { user: { fullName: string | null; phone: string } }
  }[]
}
