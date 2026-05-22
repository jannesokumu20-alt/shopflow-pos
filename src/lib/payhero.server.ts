const BASE_URL = process.env.PAYHERO_BASE_URL || "https://backend.payhero.co.ke/api/v2";

function basicAuth(): string {
  const u = process.env.PAYHERO_API_USERNAME ?? "";
  const p = process.env.PAYHERO_API_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

export function getCallbackUrl(): string {
  const explicit = process.env.PAYHERO_CALLBACK_URL;
  if (explicit) return explicit;
  const projectId = process.env.LOVABLE_PROJECT_ID || "b7d37af9-96b4-4430-a1af-163c430b0d09";
  return `https://project--${projectId}.lovable.app/api/public/webhooks/payhero`;
}

export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.length === 9) return "254" + digits;
  return digits;
}

export interface RegisterChannelParams {
  channel_type: "paybill" | "till" | "bank";
  short_code: string;
  account_number?: string;
  name: string;
}

export async function registerPaymentChannel(params: RegisterChannelParams): Promise<{ channel_id: number; raw: unknown }> {
  const accountId = Number(process.env.PAYHERO_ACCOUNT_ID);
  const body = {
    channel_type: params.channel_type,
    short_code: params.short_code,
    name: params.name,
    account_number: params.account_number ?? params.short_code,
    account_id: accountId,
  };
  const res = await fetch(`${BASE_URL}/payment_channels`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(`PayHero register channel failed (${res.status}): ${text || res.statusText}`);
  }
  const channel_id = Number(json.channel_id ?? json.id ?? json.data?.channel_id ?? json.data?.id);
  if (!channel_id || Number.isNaN(channel_id)) {
    throw new Error(`PayHero did not return a channel id: ${text}`);
  }
  return { channel_id, raw: json };
}

export interface StkPushParams {
  amount: number;
  phone_number: string;
  channel_id: number;
  external_reference: string;
  customer_name?: string;
  provider?: "m-pesa" | "sasapay";
}

export async function sendStkPush(params: StkPushParams): Promise<{ reference?: string; checkout_request_id?: string; raw: any }> {
  const body = {
    amount: Math.round(params.amount),
    phone_number: normalizeKenyanPhone(params.phone_number),
    channel_id: params.channel_id,
    provider: params.provider ?? "m-pesa",
    external_reference: params.external_reference,
    customer_name: params.customer_name ?? "Customer",
    callback_url: getCallbackUrl(),
  };
  const res = await fetch(`${BASE_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    throw new Error(`PayHero STK push failed (${res.status}): ${text || res.statusText}`);
  }
  return {
    reference: json.reference ?? json.data?.reference,
    checkout_request_id: json.CheckoutRequestID ?? json.checkout_request_id ?? json.data?.CheckoutRequestID,
    raw: json,
  };
}