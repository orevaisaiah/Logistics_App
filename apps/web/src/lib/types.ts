export type DeliveryStatus =
  | 'SEARCHING_RIDER'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETURNED'

export type VehicleType = 'BIKE' | 'TRICYCLE' | 'CAR' | 'VAN'
export type MemberRole = 'OWNER' | 'DISPATCHER' | 'FINANCE' | 'VIEWER'

export interface Me {
  id: string
  phone: string
  email: string | null
  fullName: string | null
  role: 'BUSINESS_USER' | 'RIDER' | 'ADMIN'
}

export interface Business {
  id: string
  companyName: string
  registrationNumber: string | null
  businessType: string | null
  address: string | null
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  creditLimit: number
  myRole: MemberRole
}

export interface Wallet {
  balance: number
  creditLimit: number
  availableToSpend: number
}

export interface WalletEntry {
  id: string
  type: string
  direction: 'CREDIT' | 'DEBIT'
  amount: number
  balanceAfter: number
  deliveryId: string | null
  note: string | null
  createdAt: string
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface DeliveryListItem {
  id: string
  trackingCode: string
  status: DeliveryStatus
  vehicleType: VehicleType
  price: number
  pickupAddress: string
  dropoffAddress: string
  recipientName: string
  createdAt: string
}

export interface TimelineEvent {
  status: DeliveryStatus
  actorType?: string
  note?: string | null
  createdAt: string
}

export interface DeliveryDetail extends DeliveryListItem {
  distanceKm: number
  pickupLat: number
  pickupLng: number
  pickupContactName: string
  pickupContactPhone: string
  dropoffLat: number
  dropoffLng: number
  recipientPhone: string
  packageDescription: string
  weightKg: number
  declaredValue: number | null
  isFragile: boolean
  notes: string | null
  assignedAt: string | null
  pickedUpAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  zone: { id: string; name: string }
  rider: {
    vehicleType: VehicleType | null
    plateNumber: string | null
    avgRating: number
    currentLat: number | null
    currentLng: number | null
    lastSeenAt: string | null
    user: { fullName: string | null; phone: string | null }
  } | null
  events: TimelineEvent[]
}

export interface Quote {
  zone: { id: string; name: string }
  vehicleType: VehicleType
  distanceKm: number
  price: number
  breakdown: { baseFee: number; distanceFee: number; weightFee: number; minFeeApplied: boolean; total: number }
}

export interface Topup {
  reference: string
  amount: number
  gateway: 'paystack' | 'mock'
  authorizationUrl: string
  status: string
}

export interface TopupResult {
  reference: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  amount: number
}

export interface PublicTracking {
  trackingCode: string
  status: DeliveryStatus
  createdAt: string
  deliveredAt: string | null
  cancelledAt: string | null
  events: { status: DeliveryStatus; createdAt: string }[]
}
