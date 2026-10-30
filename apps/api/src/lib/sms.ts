import { config } from '../config.js'

export async function sendSms(phone: string, message: string) {
  if (config.NODE_ENV !== 'production') {
    console.log(`[SMS to ${phone}] ${message}`)
    return
  }
  // TODO: integrate an SMS provider (for example Termii) before going live
  throw new Error('SMS provider not configured')
}
