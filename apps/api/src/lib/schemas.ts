import { z } from 'zod'
import { normalizeNgPhone } from './phone.js'

export const phoneSchema = z
  .string()
  .refine((v) => normalizeNgPhone(v) !== null, 'Invalid Nigerian phone number')
  .transform((v) => normalizeNgPhone(v) as string)

export const latSchema = z.number().min(-90).max(90)
export const lngSchema = z.number().min(-180).max(180)

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}

export const VEHICLE_TYPES = ['BIKE', 'TRICYCLE', 'CAR', 'VAN'] as const

export const DELIVERY_STATUSES = [
  'SEARCHING_RIDER',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'RETURNED',
] as const
