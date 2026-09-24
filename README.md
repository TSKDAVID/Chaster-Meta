# Chaster Messenger MVP

Operator portal for Meta Messenger (and Instagram-ready channels): OAuth Page connect, webhook ingest, AI auto-replies, FAQ knowledge, and guided onboarding.

## Setup

1. Env values live in `.env.local`.
2. Run SQL in Supabase → SQL Editor (in order if first time):
   - `supabase/schema.sql` — pages + messages
   - `supabase/schema-faqs.sql` — FAQ knowledge
   - `supabase/schema-end-chat.sql` — end-chat state + FAQ suggestions (`human` status included)
   - `supabase/schema-platform.sql` — `platform` column (`messenger` | `instagram`)
   - `supabase/schema-bookings.sql` — booking settings + ledger
   - `supabase/schema-resources.sql` — bookable resources + `resource_id` on bookings
   - `supabase/schema-resource-links.sql` — service kind, associations, `assigned_resource_id`
   - `supabase/schema-open-days.sql` — store + resource open days of week
   - `supabase/schema-page-profile.sql` — hours & place profile
   - `supabase/schema-catalog.sql` — priced catalog items
3. `npm run dev` and `npm run tunnel` (cloudflared)
4. Point Meta webhook at `https://YOUR_TUNNEL/api/webhooks/meta`

## Portal UX

- Navbar: Inbox, Bookings, FAQs, Hours, Catalog; Connect / Disconnect; profile
- Inbox: search, Messenger/Instagram filter, AI/Human/Ended badges
- Thread: handover, continue with AI, end chat
- Knowledge: FAQ + approval suggestions
- Hours & place: address, contact, open hours (synced into bookings when present)
- Catalog: products/services with prices for AI quotes
- First-visit product tour (restart from profile)

## Meta checklist

- OAuth redirect: `http://localhost:3000/api/auth/facebook/callback`
- Webhook verify token: `chaster_Auth_app0311`
- Fields: `messages`, `message_echoes`
- Scopes: `pages_show_list`, `pages_messaging`, `pages_manage_metadata`
