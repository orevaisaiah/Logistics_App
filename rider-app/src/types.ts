export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

export interface Me {
  id: string
  phone: string
  email: string | null
  fullName: string | null
  role: 'BUSINESS_USER' | 'RIDER' | 'ADMIN'
  rider: { id: string; verificationStatus: VerificationStatus; isOnline: boolean } | null
}

export interface Onboarding {
  verificationStatus: VerificationStatus
  rejectionReason: string | null
  submitted: boolean
  locked: boolean
  profile: { fullName: string | null; dateOfBirth: string | null; address: string | null; vehicleType: string | null; plateNumber: string | null; serviceArea: string | null }
  bank: { bankName: string | null; accountNumber: string | null; accountName: string | null }
  profileComplete: boolean
  bankComplete: boolean
  documents: { type: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | null; note: string | null }[]
  missingDocuments: string[]
  canSubmit: boolean
}

export interface Offer {
  assignmentId: string
  secondsLeft: number
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  distanceToPickupKm: number | null
  tripDistanceKm: number
  payout: number
  weightKg: number
  isFragile: boolean
  packageDescription: string
}

export interface Job {
  id: string
  trackingCode: string
  status: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT'
  distanceKm: number
  payout: number
  pickupAddress: string
  pickupLat: number
  pickupLng: number
  pickupContactName: string
  pickupContactPhone: string
  dropoffAddress: string
  dropoffLat: number
  dropoffLng: number
  recipientName: string
  recipientPhone: string
  packageDescription: string
  weightKg: number
  isFragile: boolean
  notes: string | null
  business: { companyName: string }
}

export interface WalletInfo {
  balance: number
  withdrawalsInProgress: number
}

export interface WalletEntry {
  id: string
  type: string
  direction: 'CREDIT' | 'DEBIT'
  amount: number
  balanceAfter: number
  note: string | null
  createdAt: string
}

export interface Withdrawal {
  id: string
  amount: number
  status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'
  rejectionReason: string | null
  requestedAt: string
  paidAt: string | null
}

export interface Page<T> {
  items: T[]
  total: number
}
