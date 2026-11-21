// What the host part of the server address tells us about whether it can work from a real phone
export function hostOf(url: string): string {
  const match = /^[a-z]+:\/\/([^/:]+)/i.exec(url.trim())
  return match ? match[1].toLowerCase() : ''
}

// Returns advice when the address cannot work on a real phone, or null when it looks plausible
export function adviceForAddress(url: string): string | null {
  const host = hostOf(url)
  if (host === '') return 'The server address is empty or not written like http://192.168.1.20:3000. Check the EXPO_PUBLIC_API_URL line in the .env file.'
  if (host === '10.0.2.2') {
    return 'That address only works inside an Android emulator. On a real phone, use your computer address: run  node find-my-address.mjs --write  in the rider-app folder, then restart the app with  npx expo start --clear.'
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'That address means "this phone itself", so it cannot find your computer. Run  node find-my-address.mjs --write  in the rider-app folder, then restart the app with  npx expo start --clear.'
  }
  return null
}
