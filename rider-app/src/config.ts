import { Platform } from 'react-native'

// Where the logistics API runs. Set EXPO_PUBLIC_API_URL in the .env file.
//  - Real phone: your computer's address on the Wi-Fi, for example http://192.168.1.20:3000
//  - Android emulator: http://10.0.2.2:3000 (its name for "this computer")
//  - iPhone simulator: http://localhost:3000
const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000'
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? fallback).replace(/\/$/, '')

// How often the app asks the server for news, in milliseconds
export const POLL_OFFER_MS = 3000
export const POLL_JOB_MS = 5000
export const LOCATION_HEARTBEAT_MS = 10_000

// Smallest withdrawal: 1,000 naira, in kobo
export const MIN_WITHDRAWAL_KOBO = 100_000
