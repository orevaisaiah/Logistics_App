import { AppError } from '../../lib/errors.js'
import { config } from '../../config.js'

export type VerifyResult = { status: 'success' | 'failed' | 'pending'; amount: bigint; currency: string }

export interface PaymentGateway {
  name: 'paystack' | 'mock'
  initialize(input: { email: string; amount: bigint; reference: string }): Promise<{ authorizationUrl: string }>
  verify(reference: string, expectedAmount: bigint): Promise<VerifyResult>
}

class PaystackGateway implements PaymentGateway {
  name = 'paystack' as const
  constructor(private secretKey: string) {}

  private async call(path: string, init: RequestInit = {}) {
    let res: Response
    try {
      res = await fetch(`https://api.paystack.co${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch {
      throw new AppError(502, 'PAYMENT_GATEWAY_UNREACHABLE', 'Could not reach the payment provider. Try again shortly.')
    }
    const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: any } | null
    if (!res.ok || !json?.status) {
      throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', json?.message ?? 'The payment provider returned an error')
    }
    return json.data
  }

  async initialize({ email, amount, reference }: { email: string; amount: bigint; reference: string }) {
    const data = await this.call('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: Number(amount), // Paystack takes kobo, the same unit used here
        reference,
        currency: 'NGN',
        ...(config.PAYSTACK_CALLBACK_URL ? { callback_url: config.PAYSTACK_CALLBACK_URL } : {}),
      }),
    })
    return { authorizationUrl: data.authorization_url as string }
  }

  async verify(reference: string): Promise<VerifyResult> {
    const data = await this.call(`/transaction/verify/${encodeURIComponent(reference)}`)
    const status = data.status === 'success' ? 'success' : ['failed', 'abandoned', 'reversed'].includes(data.status) ? 'failed' : 'pending'
    return { status, amount: BigInt(data.amount), currency: String(data.currency) }
  }
}

// Development only: pretends every top-up succeeds so you can test without a Paystack account
class MockGateway implements PaymentGateway {
  name = 'mock' as const
  async initialize({ reference }: { reference: string }) {
    return { authorizationUrl: `mock://pay/${reference}` }
  }
  async verify(_reference: string, expectedAmount: bigint): Promise<VerifyResult> {
    return { status: 'success', amount: expectedAmount, currency: 'NGN' }
  }
}

let gateway: PaymentGateway | null = null

export function getGateway(): PaymentGateway {
  gateway ??= config.PAYSTACK_SECRET_KEY ? new PaystackGateway(config.PAYSTACK_SECRET_KEY) : new MockGateway()
  return gateway
}
