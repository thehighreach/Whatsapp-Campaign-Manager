import { optionalEnv, requireEnv } from "./env";

export function graphApiVersion(): string {
  const version = optionalEnv("GRAPH_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("Set GRAPH_API_VERSION to the version shown in your Meta app dashboard, e.g. v27.0.");
  }
  return version;
}

function apiBase() {
  return `https://graph.facebook.com/${graphApiVersion()}`;
}

/** Friendly explanations for the Meta error codes most often hit in production. */
const META_ERROR_HINTS: Record<number, string> = {
  0: "Authentication failed. The access token is invalid or expired; use the System User permanent token.",
  190: "Access token expired or invalid. Generate a System User permanent token.",
  10: "Permission denied. Give the System User full control of the WABA and the whatsapp_business_messaging scope.",
  200: "Permission denied. Check the token's WhatsApp permissions and asset assignment.",
  100: "Invalid parameter. Check the phone number ID, template name, language and variables.",
  131000: "Meta internal error. Retry later.",
  131005: "Access denied. The token lacks permission for this phone number.",
  131008: "A required parameter is missing.",
  131009: "A parameter value is invalid.",
  131026: "Message undeliverable. The recipient may not use WhatsApp, may be on an old app version, or has not accepted the new terms.",
  131030: "Recipient is not in the allowed list. Add the number to the test recipients or use a production number.",
  131031: "Business account locked or restricted. Check WhatsApp Manager.",
  131042: "Payment issue. Add or fix the payment method on the WhatsApp Business Account.",
  131045: "Phone number is not registered on Cloud API. Register it with a 6-digit PIN.",
  131047: "More than 24 hours since the user last replied. Only an approved template can be sent.",
  131049: "Meta limited marketing messages to this user to keep engagement healthy. Try again later.",
  131050: "The user has stopped marketing messages from your business.",
  131051: "Unsupported message type.",
  131056: "Too many messages to the same user in a short time (pair rate limit).",
  131066: "Marketing message not delivered because of template quality or price limits.",
  132000: "The number of template variables does not match the approved template.",
  132001: "The template does not exist for this name and language, or is not approved yet.",
  132005: "The translated template text is too long.",
  132007: "The template content violates WhatsApp policy.",
  132012: "Template parameter format mismatch (for example, the header media type does not match).",
  132015: "The template is paused because of low quality.",
  132016: "The template is disabled.",
  133010: "Phone number is not registered on the WhatsApp Business Platform.",
  130429: "Throughput rate limit hit. Slow down.",
  131048: "Spam rate limit hit. The number's quality is low; reduce volume and improve targeting.",
  368: "Temporarily blocked for policy violations.",
};

export function describeMetaError(error: any): string {
  if (!error) return "Delivery failed";
  const code = Number(error.code);
  const base = error.error_data?.details || error.message || error.title || "Meta API error";
  const hint = META_ERROR_HINTS[code];
  return `${Number.isFinite(code) ? `[${code}] ` : ""}${base}${hint ? ` (${hint})` : ""}`;
}

export async function metaFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${requireEnv("WHATSAPP_ACCESS_TOKEN")}`,
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.error ? describeMetaError(data.error) : `Meta API request failed (${response.status})`;
    const err = new Error(message) as Error & { meta?: any; status?: number; code?: number };
    err.meta = data;
    err.status = response.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export async function uploadWhatsAppMedia(file: File) {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", file, file.name);

  return metaFetch(`/${phoneNumberId}/media`, {
    method: "POST",
    body: form,
  });
}

type TemplateSendInput = {
  to: string;
  templateName: string;
  languageCode: string;
  bodyValues?: string[];
  headerMediaId?: string;
  headerType?: "image" | "video" | "document";
};

/**
 * When WHATSAPP_USE_MARKETING_MESSAGES_API=true, marketing templates are sent through
 * Meta's Marketing Messages API for WhatsApp (/marketing_messages). Your WABA must be
 * onboarded to it in the app dashboard (Use cases > WhatsApp > Production setup) first.
 */
function messagesEndpoint(phoneNumberId: string) {
  const useMm = optionalEnv("WHATSAPP_USE_MARKETING_MESSAGES_API").toLowerCase() === "true";
  return `/${phoneNumberId}/${useMm ? "marketing_messages" : "messages"}`;
}

export async function sendTemplateMessage(input: TemplateSendInput) {
  const phoneNumberId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const components: any[] = [];

  if (input.headerMediaId && input.headerType) {
    components.push({
      type: "header",
      parameters: [
        {
          type: input.headerType,
          [input.headerType]: { id: input.headerMediaId },
        },
      ],
    });
  }

  if (input.bodyValues?.length) {
    components.push({
      type: "body",
      parameters: input.bodyValues.map((text) => ({ type: "text", text })),
    });
  }

  return metaFetch(messagesEndpoint(phoneNumberId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(components.length ? { components } : {}),
      },
    }),
  });
}
