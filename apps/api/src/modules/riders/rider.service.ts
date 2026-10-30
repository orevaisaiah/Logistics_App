import type { DocumentType, Rider, VehicleType } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { storage } from '../../lib/storage.js'
import { AppError } from '../../lib/errors.js'

export const REQUIRED_DOCUMENTS: DocumentType[] = [
  'ID',
  'LICENCE',
  'VEHICLE_PAPERS',
  'SELFIE',
  'GUARANTOR_FORM',
]

type ProfileInput = {
  fullName?: string
  dateOfBirth?: Date
  address?: string
  vehicleType?: VehicleType
  plateNumber?: string
  serviceArea?: string
}

type BankInput = { bankName: string; accountNumber: string; accountName: string }

async function getRider(userId: string) {
  const rider = await prisma.rider.findUnique({ where: { userId } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')
  return rider
}

// Once submitted, details are locked while under review or after approval.
// A rejected rider can edit and resubmit.
function isLocked(rider: Rider) {
  return rider.submittedAt !== null && rider.verificationStatus !== 'REJECTED'
}

function assertEditable(rider: Rider) {
  if (isLocked(rider)) {
    throw new AppError(409, 'ONBOARDING_LOCKED', 'Your details are under review or approved and cannot be edited')
  }
}

// The file type is decided from the file's own bytes, not from what the client claims
function detectExtension(b: Buffer): string | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg'
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp'
  if (b.subarray(0, 4).toString('ascii') === '%PDF') return '.pdf'
  return null
}

const documentSelect = { id: true, type: true, status: true, note: true, createdAt: true } as const

export async function updateProfile(userId: string, data: ProfileInput) {
  const rider = await getRider(userId)
  assertEditable(rider)

  const { fullName, ...riderFields } = data
  await prisma.$transaction([
    ...(fullName ? [prisma.user.update({ where: { id: userId }, data: { fullName } })] : []),
    prisma.rider.update({ where: { id: rider.id }, data: riderFields }),
  ])
  return getOnboarding(userId)
}

export async function updateBank(userId: string, data: BankInput) {
  const rider = await getRider(userId)
  assertEditable(rider)
  await prisma.rider.update({ where: { id: rider.id }, data })
  return getOnboarding(userId)
}

export async function uploadDocument(userId: string, type: DocumentType, buffer: Buffer) {
  const rider = await getRider(userId)
  assertEditable(rider)

  const ext = detectExtension(buffer)
  if (!ext) throw new AppError(400, 'UNSUPPORTED_FILE', 'Upload a JPG, PNG, WebP or PDF file')

  const existing = await prisma.riderDocument.findFirst({ where: { riderId: rider.id, type } })
  if (existing?.status === 'APPROVED') {
    throw new AppError(409, 'DOCUMENT_APPROVED', 'This document is already approved')
  }

  const key = await storage.save(`rider-docs/${rider.id}`, buffer, ext)
  const doc = await prisma.riderDocument.create({
    data: { riderId: rider.id, type, fileUrl: key },
    select: documentSelect,
  })

  // Replace the older upload of the same type
  if (existing) {
    await prisma.riderDocument.delete({ where: { id: existing.id } })
    await storage.remove(existing.fileUrl)
  }
  return doc
}

export async function listDocuments(userId: string) {
  const rider = await getRider(userId)
  return prisma.riderDocument.findMany({
    where: { riderId: rider.id },
    select: documentSelect,
    orderBy: { createdAt: 'asc' },
  })
}

export async function getOnboarding(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { rider: { include: { documents: { select: documentSelect } } } },
  })
  const rider = user.rider
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider profile not found')

  const profileComplete = Boolean(
    user.fullName && rider.dateOfBirth && rider.address && rider.vehicleType && rider.plateNumber && rider.serviceArea,
  )
  const bankComplete = Boolean(rider.bankName && rider.accountNumber && rider.accountName)

  const documents = REQUIRED_DOCUMENTS.map((type) => {
    const doc = rider.documents.find((d) => d.type === type)
    return { type, status: doc?.status ?? null, note: doc?.note ?? null }
  })
  // A rejected document counts as missing because it must be uploaded again
  const missingDocuments = documents.filter((d) => d.status === null || d.status === 'REJECTED').map((d) => d.type)

  const locked = isLocked(rider)
  return {
    verificationStatus: rider.verificationStatus,
    rejectionReason: rider.rejectionReason,
    submitted: rider.submittedAt !== null,
    locked,
    profile: {
      fullName: user.fullName,
      dateOfBirth: rider.dateOfBirth,
      address: rider.address,
      vehicleType: rider.vehicleType,
      plateNumber: rider.plateNumber,
      serviceArea: rider.serviceArea,
    },
    bank: {
      bankName: rider.bankName,
      accountNumber: rider.accountNumber,
      accountName: rider.accountName,
    },
    profileComplete,
    bankComplete,
    documents,
    missingDocuments,
    canSubmit: !locked && profileComplete && bankComplete && missingDocuments.length === 0,
  }
}

export async function submitForReview(userId: string) {
  const onboarding = await getOnboarding(userId)
  if (onboarding.locked) throw new AppError(409, 'ONBOARDING_LOCKED', 'Already submitted')
  if (!onboarding.canSubmit) {
    throw new AppError(400, 'ONBOARDING_INCOMPLETE', 'Complete your profile, bank details and all documents first')
  }

  const rider = await getRider(userId)
  await prisma.rider.update({
    where: { id: rider.id },
    data: { verificationStatus: 'PENDING', rejectionReason: null, submittedAt: new Date() },
  })
  return getOnboarding(userId)
}
