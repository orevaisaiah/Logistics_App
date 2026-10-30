import path from 'node:path'
import { prisma } from '../../lib/prisma.js'
import { storage } from '../../lib/storage.js'
import { audit } from '../../lib/audit.js'
import { AppError } from '../../lib/errors.js'
import { REQUIRED_DOCUMENTS } from '../riders/rider.service.js'

type StatusFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ALL'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

// The review queue: riders who have submitted their application, oldest first
export async function listRiders(input: { status: StatusFilter; page: number; limit: number }) {
  const { status, page, limit } = input
  const where = {
    submittedAt: { not: null },
    ...(status === 'ALL' ? {} : { verificationStatus: status }),
  }

  const [items, total] = await prisma.$transaction([
    prisma.rider.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        verificationStatus: true,
        submittedAt: true,
        vehicleType: true,
        serviceArea: true,
        user: { select: { fullName: true, phone: true } },
        _count: { select: { documents: true } },
      },
    }),
    prisma.rider.count({ where }),
  ])
  return { items, total, page, limit }
}

export async function getRiderDetail(riderId: string) {
  const rider = await prisma.rider.findUnique({
    where: { id: riderId },
    include: {
      user: { select: { id: true, fullName: true, phone: true, email: true, createdAt: true } },
      documents: {
        select: { id: true, type: true, status: true, note: true, reviewedById: true, reviewedAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found')
  return rider
}

export async function getDocumentFile(adminId: string, riderId: string, documentId: string) {
  const doc = await prisma.riderDocument.findFirst({ where: { id: documentId, riderId } })
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found')

  const buffer = await storage.read(doc.fileUrl)
  await audit(adminId, 'DOCUMENT_VIEWED', 'RiderDocument', doc.id, { riderId, type: doc.type })

  const contentType = CONTENT_TYPES[path.extname(doc.fileUrl).toLowerCase()] ?? 'application/octet-stream'
  return { buffer, contentType }
}

async function assertUnderReview(riderId: string) {
  const rider = await prisma.rider.findUnique({ where: { id: riderId } })
  if (!rider) throw new AppError(404, 'NOT_FOUND', 'Rider not found')
  if (rider.submittedAt === null || rider.verificationStatus !== 'PENDING') {
    throw new AppError(409, 'NOT_UNDER_REVIEW', 'This application is not waiting for review')
  }
  return rider
}

export async function reviewDocument(
  adminId: string,
  riderId: string,
  documentId: string,
  decision: { status: 'APPROVED' | 'REJECTED'; note?: string },
) {
  await assertUnderReview(riderId)

  const doc = await prisma.riderDocument.findFirst({ where: { id: documentId, riderId } })
  if (!doc) throw new AppError(404, 'NOT_FOUND', 'Document not found')

  await prisma.$transaction([
    prisma.riderDocument.update({
      where: { id: doc.id },
      data: { status: decision.status, note: decision.note ?? null, reviewedById: adminId, reviewedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        adminUserId: adminId,
        action: decision.status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
        entityType: 'RiderDocument',
        entityId: doc.id,
        meta: { riderId, type: doc.type, note: decision.note ?? null },
      },
    }),
  ])
  return getRiderDetail(riderId)
}

export async function approveRider(adminId: string, riderId: string) {
  await assertUnderReview(riderId)

  const docs = await prisma.riderDocument.findMany({ where: { riderId } })
  const notApproved = REQUIRED_DOCUMENTS.filter((type) => docs.find((d) => d.type === type)?.status !== 'APPROVED')
  if (notApproved.length > 0) {
    throw new AppError(400, 'DOCUMENTS_NOT_APPROVED', `Approve these documents first: ${notApproved.join(', ')}`)
  }

  await prisma.$transaction(async (tx) => {
    // The conditions in "where" guard against two admins deciding at the same moment
    const result = await tx.rider.updateMany({
      where: { id: riderId, verificationStatus: 'PENDING', submittedAt: { not: null } },
      data: { verificationStatus: 'APPROVED', rejectionReason: null },
    })
    if (result.count === 0) throw new AppError(409, 'NOT_UNDER_REVIEW', 'This application is not waiting for review')
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'RIDER_APPROVED', entityType: 'Rider', entityId: riderId },
    })
  })
  return getRiderDetail(riderId)
}

export async function rejectRider(adminId: string, riderId: string, reason: string) {
  await assertUnderReview(riderId)

  await prisma.$transaction(async (tx) => {
    const result = await tx.rider.updateMany({
      where: { id: riderId, verificationStatus: 'PENDING', submittedAt: { not: null } },
      data: { verificationStatus: 'REJECTED', rejectionReason: reason },
    })
    if (result.count === 0) throw new AppError(409, 'NOT_UNDER_REVIEW', 'This application is not waiting for review')
    await tx.auditLog.create({
      data: { adminUserId: adminId, action: 'RIDER_REJECTED', entityType: 'Rider', entityId: riderId, meta: { reason } },
    })
  })
  return getRiderDetail(riderId)
}
