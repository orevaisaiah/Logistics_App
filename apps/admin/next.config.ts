import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The panel checks the sign-in in the browser before showing a page, so its pages cannot be
  // pre-built as instant navigations. This limits Next.js's instant-navigation checks to pages that ask for them.
  experimental: {
    instantInsights: { validationLevel: 'manual-warning' },
  },
  // Staff pages must never be cached or indexed
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig
