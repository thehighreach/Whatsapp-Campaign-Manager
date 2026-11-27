# High Reach WhatsApp Campaign Manager

A High Reach-branded starter application for **official WhatsApp Business Platform / Cloud API** campaigns to **opted-in contacts**.

## What it includes

- High Reach branded web dashboard
- CSV contact import
- Mandatory opt-in confirmation and per-row `opt_in=yes` requirement
- Phone normalization for Indian 10-digit numbers
- Image / video / PDF upload to WhatsApp media endpoint
- Approved marketing-template sending
- Positional template personalization from contact fields
- Sent / delivered / read / failed logging
- WhatsApp webhook verification
- Automatic opt-out on STOP / UNSUBSCRIBE / CANCEL / OPT OUT / REMOVE
- Basic-auth dashboard protection
- Supabase database schema
- A safe default send-action cap

## What it intentionally does not include

- WhatsApp Web scraping or automation
- Sending to scraped/purchased lists
- Number rotation
- fingerprint spoofing
- ban-evasion / “anti-ban” tricks
- bypassing Meta messaging limits

Those patterns are not a safe foundation for High Reach and can violate WhatsApp rules.

## Quick start

1. Read `docs/META_SETUP.md` completely.
2. Create Supabase and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in all values.
4. Install and launch:

```bash
npm install
npm run dev
```

5. Open `http://localhost:3000`.
6. Create and approve the Meta marketing template described in `docs/TEMPLATE_COPY.md`.
7. Test with your own opted-in number before any real campaign.

## CSV format

See `sample_contacts.csv`.

Minimum required columns:

```csv
phone,opt_in
919876543210,yes
```

Recommended:

```csv
phone,name,company,city,opt_in,opt_in_source,tags
919876543210,Sample Lead,Example Company,Bengaluru,yes,website_form,"branding,lead"
```

The importer refuses rows without an explicit opt-in marker.

## Template personalization

If your approved template body is:

`Hi {{1}}, looking for the right creative and growth partner for {{2}}?`

and you enter:

`name,company`

in the dashboard, the API sends the selected contact's name as `{{1}}` and company as `{{2}}`.

Standard fields available:

- `name`
- `company`
- `city`
- `phone`

Extra CSV columns are retained in `custom_fields` and can also be referenced by column name.

## Media

The dashboard uploads JPG, PNG, MP4, 3GP or PDF files through the official WhatsApp media endpoint. The chosen media type must match the approved template's header type.

For GIF-like campaign visuals, export the animation as MP4 and use an approved video-header template rather than relying on `.gif` as a general template header upload.

## Security

- Keep `.env.local` out of Git.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `WHATSAPP_ACCESS_TOKEN` in client-side code.
- Change the default dashboard username/password.
- Use a private GitHub repository.
- Use HTTPS in production.

## Scaling note

This starter sends a small batch inside a single server request. It defaults to 50 recipients per action. Before large-scale campaigns, add a durable queue worker and use WhatsApp Manager's current messaging limits/quality controls as the source of truth.
