# Chaster design system

Source of truth for **Chaster** products: this Messenger operator desk today, and **Chaster CRM** (built on Atomic CRM / shadcn-admin-kit) tomorrow. Same ecosystem, same visual language.

If a change fights this file, change the product to match this file — not the other way around.

---

## Product intent

Chaster is an **operator desk** for customer conversations (Messenger / Instagram) and CRM ops. Quiet confidence, ink on paper, one sharp accent color. It should feel **human-designed and product-owned**, never like a Tailwind/shadcn template or an AI-generated SaaS shell.

Atomic CRM is the **engine** (data model, admin kit, Supabase). Chaster is the **skin and product voice**. Theme Atomic CRM surfaces with the same tokens and rules so inbox, CRM, and future modules feel like one product.

---

## Direction (do this)

- Dense, typographic, slightly industrial
- Separate regions with **tone + whitespace** first; borders only where needed
- Mixed radius on purpose (chrome sharp, messages softer)
- Custom icon strokes from `src/components/icons.tsx` — not Lucide wallpaper
- Status as **text + tiny square mark** (`.ch-status`), not candy pills
- Message reading in **Source Serif 4**; chrome in **Bricolage Grotesque**; IDs in **IBM Plex Mono**
- Thread field uses ruled paper (`.ch-ruled`); incoming/outgoing messages must stay **clearly distinct** from the field
- Theme previews always sit on a **light nest** so dark swatches stay readable on dark UI
- Prefer ink / signal / brass accents — never default Tailwind blue as the brand accent

---

## Anti-slop (never do this)

Hard bans — reject in review:

| Ban | Why |
|-----|-----|
| Inter, Roboto, Plus Jakarta, Geist, system-ui as the only face | Startup / AI default type |
| Tailwind blue `#2563eb` / `#3b82f6` or purple→indigo gradients | Strongest AI-SaaS fingerprint |
| Uniform `rounded-xl` / `rounded-2xl` on every surface | Soft blob UI |
| Lucide (or any stock set) on every button | Generic icon chrome |
| Soft AI-generated PNG icons / glossy 3D badges | Looks like Midjourney UI kits |
| “AI live” / green status dots as product chrome | Loud AI-SaaS fingerprint |
| White cards on gray-50 with 1px gray borders everywhere | Cardocalypse |
| Uppercase micro-labels with wide tracking (“OPERATOR DESK”) | Template chrome |
| Glass blur stickies, glow, multi-layer shadows | Decorative AI polish |
| Nested cards inside cards | Depth without hierarchy |
| Left colored border strip as decoration | Only for selection / true state |
| Transparent / near-transparent incoming bubbles on the chat field | Messages must not melt into the background |
| Theme swatches without a light nest on dark themes | Previews become invisible |
| “Make it look more modern/professional” with no token change | Slides back to averages |

---

## Tokens

Map every surface through CSS variables on `[data-theme="…"]` in `src/app/globals.css`.

| Token | Role |
|-------|------|
| `--background` | App shell behind the desk |
| `--chaster-ink` | Primary text / strong actions |
| `--chaster-muted` | Meta, timestamps, hints |
| `--chaster-panel` | Primary surfaces (header, thread chrome) |
| `--chaster-panel-soft` | Inbox / secondary field |
| `--chaster-chat-bg` | Message viewport base |
| `--chaster-border` / `--chaster-border-strong` | Rules when tone isn’t enough |
| `--chaster-accent` / `--chaster-on-accent` | Signal actions (send, focus, live cue) |
| `--chaster-bubble-out` / `--chaster-bubble-out-text` | Operator / AI outbound |
| `--chaster-bubble-in` / `--chaster-bubble-in-ring` | Customer inbound — **must contrast** vs `--chaster-chat-bg` |
| `--chaster-success-*` / `--chaster-warn-*` / `--chaster-danger-*` | Semantic text/marks (prefer text over filled pills) |
| `--chaster-radius` | Chrome radius (≈2–4px) |
| `--chaster-radius-msg` / `--chaster-radius-msg-out` | Message corners |
| `--chaster-rule` | Ruled paper lines for `.ch-ruled` |
| `--chaster-ring` | Focus ring |

### Themes

`light` · `dark` · `slate` · `ocean` · `forest` · `midnight` · `sand`

Prefs persist **per Facebook account** in Supabase (`messenger_operator_prefs`) with local cache. New Chaster CRM surfaces should read the same account theme when possible.

---

## Type

| Use | Face | Notes |
|-----|------|-------|
| Display / UI | Bricolage Grotesque (`--font-display`) | Tracking tight on titles |
| Long reading | Source Serif 4 (`--font-serif`) | Message bodies, helper copy |
| Meta / IDs | IBM Plex Mono (`--font-mono`) | Peer IDs, counts, timestamps |

Do not introduce a fourth family without updating this file.

---

## Components & patterns

### Buttons

Use `.ch-btn`, `.ch-btn-primary`, `.ch-btn-ghost`, `.ch-btn-text`. Primary = signal color. Ghost = outlined ink. Avoid filled rainbow status buttons.

### Inputs

`.ch-input` — sharp radius, strong border, signal focus ring.

### Status

`.ch-status` + `.ch-status-dot` — e.g. “Live”, “Human on desk”, “Closed”. No pastel pills.

### Icons

Only `src/components/icons.tsx` (and channel brand marks). Keep strokes square/round consistently; don’t restyle per screen.

### Messages

- **Outgoing:** solid `--chaster-bubble-out` block, serif body, mono meta underneath  
- **Incoming:** solid `--chaster-bubble-in` panel (not transparent), left rule optional, must read as a discrete object on the ruled field  
- Timestamps outside the bubble in mono

### Theme picker

Swatch strips always render on a **fixed light nest** (`#f4f4f5` plate) with a dark inset edge so Dark / Midnight / Ocean previews stay visible on dark menus.

### Inbox

Flat conversation list — closer to email than chat-app templates:

- No circular avatars, no floating rounded cards, no soft shadows
- Full-width rows with hairline dividers; selected row inverts to ink
- Name + time on one line; one-line serif preview underneath
- Tiny channel mark + “Facebook” / “Instagram” meta
- Always show who is handling the chat: **AI handling** · **You’re replying** · **Closed**
- Filters: single segmented control **All | Facebook | Instagram**

### Knowledge / CRM panels

Same tokens. Prefer underline tabs over pill tabs. Serif for explanatory copy, grotesk for titles.

---

## Chaster CRM (Atomic) ecosystem

When skinning Atomic CRM / shadcn-admin-kit:

1. Remap shadcn semantic vars to Chaster tokens (`--primary` → `--chaster-accent`, `--background` → Chaster paper, `--muted-foreground` → `--chaster-muted`, etc.).
2. Keep **one** radius scale and **one** type pairing across CRM and inbox.
3. Replace stock Lucide-heavy nav with Chaster icons where it doesn’t hurt accessibility.
4. Ban default shadcn blue primary; use the active theme’s signal color.
5. Tables and lists: tone + rules, not card grids.
6. Auth / empty states: serif supporting line + grotesk title — same as inbox empty states.

Goal: opening **Chaster Inbox** and **Chaster CRM** should feel like two rooms in the same building.

---

## Review checklist

Before shipping UI:

- [ ] No banned fonts / Tailwind blue / purple gradients  
- [ ] No uniform large radius across chrome + messages  
- [ ] Incoming messages clearly separate from chat background  
- [ ] Theme swatches readable on dark themes  
- [ ] Status isn’t a candy pill  
- [ ] Icons from Chaster set (or brand channel marks)  
- [ ] Uses CSS variables — no one-off hex that ignores theme  
- [ ] Would still look like Chaster if the Atomic shell were swapped underneath  

---

## File map

| Path | Owns |
|------|------|
| `DESIGN.md` | This contract |
| `src/app/globals.css` | Theme tokens + shared utilities |
| `src/app/layout.tsx` | Font loading + theme boot |
| `src/lib/themes.ts` | Theme IDs / labels / swatches |
| `src/components/icons.tsx` | Icon language |
| `src/components/BrandMark.tsx` | Wordmark mark |
