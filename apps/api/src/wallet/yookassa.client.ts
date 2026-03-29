import { randomUUID } from 'node:crypto';

export interface YookassaPaymentAmount {
  value: string;
  currency: string;
}

export interface YookassaConfirmationEmbedded {
  type: 'embedded';
  confirmation_token: string;
}

export interface YookassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: YookassaPaymentAmount;
  description?: string;
  metadata?: Record<string, string>;
  confirmation: YookassaConfirmationEmbedded;
  created_at: string;
  captured_at?: string;
  paid: boolean;
}

export interface CreateYookassaPaymentInput {
  amountKopecks: number;
  currency: string;
  description: string;
  returnUrl: string;
  metadata?: Record<string, string>;
  idempotenceKey?: string;
}

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

export class YookassaClient {
  constructor(
    private readonly shopId: string,
    private readonly secretKey: string,
  ) {}

  async createPayment(input: CreateYookassaPaymentInput): Promise<YookassaPayment> {
    const idempotenceKey = input.idempotenceKey ?? randomUUID();
    const amountValue = (input.amountKopecks / 100).toFixed(2);

    const body = {
      amount: {
        value: amountValue,
        currency: input.currency,
      },
      confirmation: {
        type: 'embedded',
        return_url: input.returnUrl,
      },
      capture: true,
      description: input.description,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };

    const credentials = Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');

    const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`YooKassa API error ${response.status}: ${errorText}`);
    }

    const payment = (await response.json()) as YookassaPayment;

    return payment;
  }

  async fetchPayment(paymentId: string): Promise<YookassaPayment> {
    const credentials = Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');

    const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`YooKassa API error ${response.status}: ${errorText}`);
    }

    return (await response.json()) as YookassaPayment;
  }
}
