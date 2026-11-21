// A rider who ignores this many offers in a row is probably not looking at the phone (the app was
// left open, or closed with the rider still "online"). Taking them offline stops each missed offer
// from delaying the next customer's delivery by half a minute.
export const MISSED_OFFERS_BEFORE_OFFLINE = 3

// "statuses" are the rider's most recent offers, newest first
export function shouldGoOffline(statuses: string[], required = MISSED_OFFERS_BEFORE_OFFLINE): boolean {
  return statuses.length >= required && statuses.slice(0, required).every((s) => s === 'EXPIRED')
}
