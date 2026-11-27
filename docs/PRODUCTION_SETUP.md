# Production Setup: High Reach WhatsApp Campaign Manager

This is the go-live runbook for the Meta app dashboard (**Use cases → Customize → WhatsApp → Production setup**) together with this codebase.

## Status (as of 27 Nov 2026)

| Step | Status |
|---|---|
| Business verification | ✅ Done |
| System User permanent token | ✅ Done |
| Marketing template approved | ✅ Done |
| Real phone number (currently on the WhatsApp Business app) | ⏳ Migration or coexistence needed |
| Payment method on the WhatsApp Business Account | ⏳ To do |
| Deploy to Vercel | ⏳ To do |
| Webhook + WABA `subscribed_apps` | ⏳ To do |
| App mode → Live | ⏳ To do |

---

## 1. Phone number: the High Reach number is on the WhatsApp Business app

Choose **one**:

### Option A: Migrate the number to Cloud API (supported directly in the dashboard)
1. Back up WhatsApp Business app chats (Settings → Chats → Chat backup) if you need them.
2. In the WhatsApp Business app: **Settings → Account → Delete my account** for that number. The number can no longer be used in the phone app after this.
3. Meta dashboard → **WhatsApp → API Setup → Add phone number** → enter the display name ("High Reach"), category, and the number → verify by SMS/voice OTP.
4. Wait for display name approval.
5. Register the number on Cloud API with a 6-digit PIN. Use the dashboard's **00 Meta production setup** panel (Register button), or:
   `POST /{PHONE_NUMBER_ID}/register` with `{"messaging_product":"whatsapp","pin":"123456"}`
6. Copy the new **Phone number ID** into `WHATSAPP_PHONE_NUMBER_ID`.

### Option B: Coexistence (keep using the WhatsApp Business app and the API on the same number)
- Onboarding goes through Meta **Embedded Signup** ("Connect your existing WhatsApp Business app"), usually provided by a Tech Provider / BSP. It is not the plain "Add phone number" flow.
- Requires a recent WhatsApp Business app version, and the app must be opened at least every 14 days.
- Throughput is lower (about 20 messages/second), which is fine for this tool.
- After onboarding you **don't** call `/register`. Just set `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_WABA_ID` from the dashboard.

> Don't delete the WhatsApp Business app account until you have decided between A and B.

## 2. Payment method
WhatsApp Manager → **Settings → Payment settings** (or Business Settings → Billing & Payments) → add a card or, in India, INR prepaid / UPI funds → attach it to the WhatsApp Business Account. Without it, marketing sends fail with error **131042**.

## 3. Deploy to Vercel
1. Push the repo to a **private** GitHub repository.
2. Vercel → Import project (framework: Next.js).
3. Add these Environment Variables (Production):
   `WHATSAPP_ACCESS_TOKEN` (System User token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `GRAPH_API_VERSION` (latest shown in the dashboard), `WHATSAPP_USE_MARKETING_MESSAGES_API` (false until onboarded), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `MAX_CAMPAIGN_BATCH`.
4. Deploy. The dashboard returns **503** if `ADMIN_USERNAME` / `ADMIN_PASSWORD` are missing in production (fail-closed).
5. Supabase: run [`supabase/upgrade_production.sql`](../supabase/upgrade_production.sql) once. This adds the `inbound_messages` table for lead replies.

## 4. Webhook
1. Meta dashboard → **WhatsApp → Configuration → Webhook → Edit**
   - Callback URL: `https://<your-vercel-domain>/api/webhooks/whatsapp`
   - Verify token: the exact value of `WHATSAPP_VERIFY_TOKEN`
   - **Verify and save**, then subscribe the **`messages`** field.
2. Subscribe your WABA to the app. Click **Subscribe** in the dashboard panel, or:
   `POST /{WABA_ID}/subscribed_apps`
   Without this, real-number webhooks (delivered/read/STOP/INTERESTED) often never arrive.

## 5. App mode → Live
App settings → Basic: add a **Privacy Policy URL** (e.g. https://highreach.media/privacy), app icon and category, then switch the app from **Development** to **Live**. App Review isn't required when only High Reach's own business assets are used.

## 6. Marketing Messages API for WhatsApp (recommended)
Meta is moving marketing traffic to the **Marketing Messages API for WhatsApp**. Marketing sends through the standard Cloud API `/messages` endpoint are announced to sunset in Oct 2027. If the Production setup page offers onboarding:
1. Complete the onboarding / accept the terms there.
2. Set `WHATSAPP_USE_MARKETING_MESSAGES_API=true` in Vercel and redeploy. The app then sends via `/{PHONE_NUMBER_ID}/marketing_messages`.

## 7. Verify
1. Open the dashboard. The **00 Meta production setup** panel should show every check as **done**, with quality rating and messaging limit.
2. Send the approved template to your own opted-in number.
3. Check that the status moves sent → delivered → read in **05 Recent delivery activity**.
4. Reply `INTERESTED`. It should show in **06 Replies from leads**.
5. Reply `STOP` (or tap the opt-out button). The contact should drop out of the eligible list.
6. Then start small campaigns (≤ 50 per send) and watch the quality rating.
