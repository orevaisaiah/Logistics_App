import { redirect } from 'next/navigation'

// The dashboard checks the sign-in itself and sends visitors to the sign-in page when needed
export default function Home() {
  redirect('/dashboard')
}
