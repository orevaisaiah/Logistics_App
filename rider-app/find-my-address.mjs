// Finds the address your phone must use to reach the API on this computer.
//   node find-my-address.mjs           shows the address(es)
//   node find-my-address.mjs --write   also saves the best one into the .env file
import fs from 'node:fs'
import os from 'node:os'

const PORT = process.env.API_PORT ?? '3000'

const looksLikeWifi = (name) => /wi-?fi|wireless|wlan|en0|wlp/i.test(name)
const privateRank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)

const found = []
for (const [name, list] of Object.entries(os.networkInterfaces())) {
  for (const entry of list ?? []) {
    if (entry.family === 'IPv4' && !entry.internal) found.push({ name, ip: entry.address })
  }
}
// The Wi-Fi adapter first. Virtual adapters (Docker, WSL, VirtualBox) are listed last because a phone cannot use them.
found.sort((a, b) => Number(!looksLikeWifi(a.name)) - Number(!looksLikeWifi(b.name)) || privateRank(a.ip) - privateRank(b.ip))

if (found.length === 0) {
  console.log('No network connection found. Connect this computer to your Wi-Fi and try again.')
  process.exit(1)
}

console.log('')
console.log('Your computer can be reached at:')
for (const { name, ip } of found) console.log(`  ${ip}   (${name})`)
console.log('')
const best = found[0]
const line = `EXPO_PUBLIC_API_URL=http://${best.ip}:${PORT}`
console.log('The best guess is the first one. The line for your .env file is:')
console.log(`  ${line}`)
console.log('')
console.log(`To check it, open  http://${best.ip}:${PORT}/health  in the browser on your PHONE (on the same Wi-Fi).`)
console.log('You should see: {"status":"ok"}')
console.log('')

if (process.argv.includes('--write')) {
  const existing = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('EXPO_PUBLIC_API_URL=')) : []
  fs.writeFileSync('.env', [...existing, line, ''].join('\n'))
  console.log('Saved to .env. Now restart the app: stop it with Ctrl+C and run  npx expo start  again.')
  console.log('')
}
