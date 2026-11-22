# Reely AI — Complete Build Brief for Gemini

By Reely AI founder. Version 1.0.

## How to use this document (for the owner)

1. Paste **Part A (Master Brief)** and **Part B (Content Engine)** into Gemini first, as one message or two, and tell it to confirm it understood before writing code.
2. Then paste the **phase prompts in Part E one at a time**. Do not start a phase until the previous one passes its acceptance checks.
3. After every phase, ask Gemini for the TEXT AUDIT table (rule A7) and check the screen yourself.
4. Use a coding-agent environment that can create a full project with a server side. A tool that only builds front-end pages cannot host the render service or the job queue.

---

# PART A — MASTER BRIEF

## A1. Role and mission

You are a senior full-stack engineer and product designer with more than 10 years of experience building AI SaaS products. You are building **Reely AI** from scratch. Work like a professional team: plan first, build in small verified steps, explain decisions briefly, never leave unfinished code, and ask the owner before inventing anything not specified here (especially payment API details and API keys).

## A2. Product summary

Reely AI is an installable web app (PWA) that lets anyone create faceless vertical reels (9:16, 1080x1920, MP4) with almost no effort. The user picks a niche, a visual style, an optional recurring character, a voice, music and a language. The AI writes a high-retention script, generates one image per scene, animates the images with motion and transitions, records a narrated voiceover, adds animated captions and music, and renders a downloadable MP4. The first market is African creators (English and French), later worldwide. Users pay with credits bought by mobile money (MTN and Orange Money) through Futura Pay.

The quality promise: a strong hook in the first 3 seconds, a story that keeps people watching to the end, consistent visuals, natural narration, and a finished look that feels professional.

## A3. Scope of version 1

**In scope:** sign-up and sign-in, onboarding, niches and recipes, create wizard, script engine, image generation, characters with consistency, voices, captions, music library and user uploads, rendering and download, credits, plans and top-ups, Futura Pay payments, admin dashboard, landing page, PWA install.

**Out of scope (do not build, and do not leave buttons or menu items for them):** auto-posting to social platforms (users download the MP4 and upload it themselves), native apps (but the architecture must allow a later Capacitor wrapper), dark mode, AI video clip generation, team accounts, UI languages other than English (but everything must be translation-ready).

## A4. Architecture

- **Monorepo:** apps/web (Next.js App Router, TypeScript strict mode, Tailwind CSS, shadcn/ui primitives restyled to our tokens, Lucide icons, Framer Motion for subtle motion), apps/render (Node service running Remotion and FFmpeg, Dockerized, deployed on a VPS), packages/shared (types, credit calculator, recipe schema, i18n keys), packages/providers (all external service adapters).
- **Supabase:** Auth (email and password, Google, phone OTP), Postgres with Row Level Security on every table, Realtime for live job progress.
- **Cloudflare R2:** all files (images, audio, videos). Never public buckets for user content: use short-lived signed URLs.
- **Inngest:** durable multi-step workflows with automatic retries. Every pipeline step is an idempotent function.
- **Hosting:** web app on Vercel or Cloudflare Pages (choose one and justify in two lines); render service on a VPS with Docker; secrets only in environment variables, never in client code.
- **Provider adapter pattern:** every external service sits behind an interface in packages/providers: ScriptProvider, TextProvider, ImageProvider, VoiceProvider, PaymentProvider, StorageProvider. Model IDs, prices and feature flags live in config tables, never scattered in code. Swapping a provider must mean changing one adapter.
- **Native-ready rules (so a Capacitor wrapper can be added later without a rewrite):** all business logic lives on the server (API routes and Inngest), the UI is a thin client; authenticated screens are client-rendered pages that fetch data through API routes; the API base URL comes from an environment variable; the UI is touch-first with safe-area insets and no hover-only interactions; PWA manifest and a service worker for the app shell are included; the session works inside a WebView.

## A5. AI providers and model map

Verify every model ID against the official documentation at build time and store them in a providers config table.

- **Final script and editor pass:** Claude Sonnet 5.5 (API id claude-sonnet-5-5) through the Anthropic API.
- **Cheap text steps** (hook drafts, topic ideas, scoring, moderation, image-versus-master consistency check, free-tier scripts): a Gemini Flash-Lite model (gemini-3.1-flash-lite) on the PAID Gemini API tier. Never send user content to a free tier, because free-tier content may be used by Google to improve its products.
- **Images, standard:** Nano Banana 2 Lite (gemini-3.1-flash-lite-image). **Images, same-character stories:** Nano Banana 2.1 (gemini-nano-banana-2.1) with reference images. Use at most 2 recurring characters per reel. **Images, free tier:** a Flux model on Cloudflare Workers AI.
- **Voice, premium:** ElevenLabs model eleven\_v3 with audio tags and timestamps. **Voice, standard:** Kokoro open-source TTS self-hosted on the render server. If a language is not supported by the standard voice, route to a premium voice and charge the premium price.
- **Caption timing:** from the voice provider timestamps. Whisper is the fallback for audio that has no timestamps.
- **Music:** a licensed AI-music library (Mubert or SOUNDRAW, license confirmed in writing) plus user uploads.
- All provider calls happen on the server only. The browser never sees a provider key or a provider name.

## A6. Brand and design system

**Brand:** Reely AI. Tone: friendly, confident, simple, no jargon. Create an SVG wordmark (Reely with a small AI badge), a favicon and PWA icons (orange rounded square with a simple play-and-reel mark).

**Colors (CSS variables and Tailwind theme):**

- Accent: 50 #FFF4EC, 100 #FFE4D1, 300 #FFB27A, 500 #FF6A1A, 600 #E5540A, 700 #B8420A.
- Neutrals: white #FFFFFF, surface #FAFAF9, border #EAE7E3, text #1C1917, muted text #6B6560.
- Status: success #16A34A, warning #D97706, error #DC2626, info #2563EB (use sparingly).
- Contrast rule (verify with a contrast checker, target WCAG AA): orange text on white uses accent-700; button backgrounds use accent-600 with white semibold text of 16px or larger; accent-500 is for icons, fills, highlights and large graphics.

**Typography:** Plus Jakarta Sans for headings, Inter for body, loaded with next/font. Scale 12, 14, 16, 18, 20, 24, 32, 40, 56.

**Shape and space:** 4-point grid; cards radius 16 to 20; buttons and inputs radius 12 to 14; pills fully rounded; two levels of soft shadow; maximum content width 1200px; mobile side padding 16px.

**Motion:** 150 to 250 ms ease-out; subtle page transitions; skeleton loaders; a tasteful animated progress screen for generation; respect prefers-reduced-motion.

**Light mode only:** set color-scheme to light and do not add dark-mode styles. Keep every color in variables so more themes can be added later.

**Layout:** mobile-first. On phones: bottom tab bar (Home, Library, a large orange Create button in the center, Credits, Profile). On desktop: left sidebar and a sticky top bar. Minimum tap target 44px.

**Components to build once and reuse:** primary, secondary and ghost buttons; inputs; selects; segmented controls; niche card, style card, reel card, plan card; modal and bottom sheet; toast; tabs; stepper; progress bar; skeleton; empty state; avatar; badge; tooltip; video player; slider.

**Imagery:** niche and style cards use real sample images generated by our own pipeline during setup and stored as assets. Never hotlink stock images. If an image is missing, show a clean gradient with an icon.

## A7. Zero leftover text rules (most important quality rule)

1. Every visible string comes from the translation file (messages/en.json). No hard-coded text in components.
2. No lorem ipsum, placeholder copy, 'TODO', 'Coming soon', 'Test', 'Sample', 'Untitled', debug labels, developer notes, component names or console text visible in the UI.
3. No label, button or menu item that does nothing. If a feature is out of scope, the control does not exist.
4. No mock data on real screens. Empty states are designed: a small illustration, one short sentence, one action.
5. Labels are short, plain and human, in sentence case. No duplicate labels and no label that repeats its heading.
6. At the end of every screen, run a TEXT AUDIT: list every visible string with its translation key and justify each one. Delete anything that has no function. Show me the audit table.
7. At the end of every phase, remove unused components, files, dependencies and commented-out code.
8. Never show raw errors, IDs, stack traces, JSON or provider names to users. Map every error to a friendly message with a next step.
9. The browser console must be clean (no warnings or errors) on all main flows.

## A8. Internationalization

- Use next-intl. The UI language is English only for now, but all text lives in messages/en.json with nested keys. Do not show a language switcher until a second language file exists; adding fr.json later must need no component changes.
- Separate two ideas: **UI language** (English only now) and **reel language** (a per-project setting).
- Reel languages at launch: English, French, Spanish, Italian, German, Portuguese. Keep them in a languages table with flags for premium voice support, standard voice support and caption font, so more can be added without code.
- The script is written natively in the reel language and never translated from English. Voices are filtered by reel language. Caption fonts must support accents. Character names and on-screen text follow the reel language. Image prompts are always sent to image models in English.
- Format money as XAF with thousand separators, for example 3,500 XAF.

## A9. Data model (Postgres)

Use uuid primary keys and created\_at and updated\_at on every table. Row Level Security: users read and write only their own rows; admin access uses profiles.role; the service role is used only on the server.

- **profiles**: id (= auth user id), display\_name, role (user or admin), default\_reel\_language, phone\_verified, free\_credits\_granted, country.
- **plans**: code, name, price\_xaf, credits, active, sort.
- **subscriptions**: user\_id, plan\_id, status, current\_period\_start, current\_period\_end.
- **credit\_lots**: user\_id, source (plan, topup, free, admin), amount, remaining, expires\_at.
- **credit\_ledger** (append-only): user\_id, delta, reason (plan\_grant, topup, free\_grant, reserve, settle, refund, admin\_adjust, expiry), project\_id, job\_id, balance\_after, meta.
- **payments**: user\_id, provider, provider\_ref, amount\_base\_xaf, fee\_xaf, total\_xaf, status (pending, paid, failed, expired, refunded), purpose (plan or topup), plan\_id, idempotency\_key, raw payload.
- **price\_table**: key, credits\_value, unit, active, notes. Editable by admins.
- **niches**, **sub\_niches**, **recipes** (sub\_niche\_id, version, config json, active).
- **styles**: slug, name, difficulty (easy, medium, hard), style\_card, cover\_asset, image\_cost\_multiplier, active.
- **characters**: user\_id, name, style\_id, description\_card, master\_asset\_id.
- **voices**: provider, provider\_voice\_id, name, language, gender, tone\_tags, tier (standard or premium), preview\_asset, active.
- **music\_tracks**: title, mood\_tags, niche\_tags, duration\_s, bpm, source (library or user), user\_id, asset\_id, license\_note, active.
- **assets**: user\_id, kind (image, audio, video, thumbnail, reference), r2\_key, mime, size, width, height, duration\_s, rights\_confirmed.
- **projects**: user\_id, title, niche\_id, sub\_niche\_id, recipe\_version, reel\_language, topic, style\_id, character\_id, voice\_id, music\_track\_id, length\_tier, status, credits\_quoted, credits\_final, final\_video\_asset\_id, thumbnail\_asset\_id.
- **scenes**: project\_id, idx, narration\_text, delivery\_tags, pause\_after\_ms, image\_prompt, image\_asset\_id, motion\_preset, transition\_preset, duration\_ms, status.
- **jobs** and **job\_events**: project\_id, kind, status, attempts, error\_code, step, message\_key, meta, timestamps.
- **generation\_costs**: project\_id, provider, model, step, units, cost\_usd. Records the real cost of every provider call so margin can be tracked.
- **languages**, **audit\_log**, **reports** (user content reports).

## A10. Credit system (authoritative)

**Price table defaults (credits):**

- Script: 20, flat.
- Image, standard: 15 each. Image, same-character: 30 each.
- Voice, premium: 1.2 per second. Voice, standard: 0.3 per second.
- Build and export: 10 per 30 seconds of final video (rounded up to 30-second blocks).
- Captions: 0. Library music: 0.
- If the user supplies their own music, images or voice recording, that step costs 0 credits. Never charge for music the user supplied.

**Length tiers:** 30 seconds is about 5 scenes, 60 seconds about 8 scenes, 90 seconds about 12 scenes. Narration runs at about 2.5 words per second.

**Examples:** 60 s, standard images, premium voice = 20 + 8x15 + 72 + 20 = 232. 60 s with same-character images = 20 + 8x30 + 72 + 20 = 352. 60 s with standard voice = 20 + 120 + 18 + 20 = 178. 30 s = 141. 90 s = 338.

**Rules:**

- The user sees a live total that updates as they change length, voice, character or uploads. That total is a quote and a maximum: the final charge never exceeds it.
- When generation starts, reserve the quoted credits (ledger reason reserve). On success, settle the actual cost and release the rest. On a failed step, refund that step. On a failed job, refund everything.
- Regenerating one scene image costs the image price. Re-voicing one scene costs that scene's voice price. Automatic quality retries (maximum 2 per image) are never charged.
- Never allow a negative balance. Spend credits that expire first, then credits that do not.
- All credit math lives in packages/shared and is unit tested.

**Plans** (prices exclude the 3% fee):

- Free: 120 credits once per verified phone number. Watermark, maximum 30 seconds, standard voice and Flux images only.
- Starter: 3,500 XAF for 1,000 credits.
- Creator: 9,000 XAF for 2,700 credits.
- Pro: 20,000 XAF for 6,300 credits.
- Top-up pack: 4,000 XAF for 1,000 credits, any number of packs.
- Plan credits expire at the end of the billing period with no rollover. Top-up credit expiry is an open question for the owner (default to 90 days until confirmed).

**Processing fee:** the user pays the base price plus 3%, shown as its own line at checkout. Credits are granted on the base price only. Example: Starter 3,500 + 105 = 3,605 XAF. Round the fee up to a whole XAF.

**Abuse protection:** one free grant per verified phone number; rate limits; a maximum of 2 simultaneous jobs per user; a daily generation cap; an admin alert when the daily real provider cost passes a threshold set in settings.

**Admin control:** admins can edit the price table and plans (changes apply to new purchases and new generations only) and can adjust a user's credits with a written reason that is saved to the audit log.

## A11. Payments with Futura Pay

- Define a PaymentProvider interface: createCheckout, verifyWebhook, getStatus, refund. The owner will supply the Futura Pay API documentation and keys. Do NOT invent Futura Pay endpoints. Until the docs arrive, build a MockPaymentProvider that is enabled only when the environment is development and PAYMENT\_PROVIDER=mock, and make it unreachable in production.
- Flow: the user picks a plan or top-up. The server creates a pending payment with an idempotency key. The user pays with MTN or Orange Money through Futura Pay. A webhook confirms. The server verifies the signature, then in a single transaction marks the payment paid, creates the credit lot and ledger entry, and activates or extends the subscription.
- Handle: duplicate webhooks, late webhooks, failed or expired payments, the user closing the page (use both the webhook and status polling), amount mismatch (reject and alert the admin), and admin refunds (reverse the ledger).
- Never grant credits from a client-side confirmation.
- Mobile money has no automatic recurring debit, so a subscription renews only when the user pays again. Show a renewal reminder banner 3 days before the period ends.
- Provide a receipts page for every payment.

---

# PART B — CONTENT ENGINE

## B1. Generation pipeline

Build one Inngest function called generate-reel, made of idempotent steps. Each step writes a job\_event so the user sees live progress. The label in brackets is what the user sees (all labels come from messages/en.json).

1. **Validate and reserve** \[Getting ready\]: check inputs, compute the quote, reserve credits.
2. **Moderate** \[Getting ready\]: classify the topic with the cheap text model. Refuse unsafe topics with a friendly message and release the credits.
3. **Hooks** \[Writing your script\]: generate 5 hook candidates from the recipe's hook styles, score them, keep the best.
4. **Script** \[Writing your script\]: Claude writes the full narration in the reel language, following the recipe beats, tone and length.
5. **Editor pass** \[Polishing your story\]: Claude acts as a retention editor, cuts slow lines, sharpens the hook and the ending, and enforces the rules.
6. **Scene split** \[Planning your scenes\]: output strict JSON (schema in B4). Validate it. If invalid, run a repair loop, maximum 2 times.
7. **Images** \[Drawing your visuals\]: generate in parallel (concurrency 4). Quality gate: a cheap vision model compares each image with the style card and, for character reels, with the master picture. A score below 7 out of 10 or a visible defect triggers a retry (maximum 2, never charged).
8. **Voice** \[Recording the voiceover\]: generate narration sentence by sentence with the delivery tags, keep the timestamps, and insert exact silence from pause\_after\_ms using FFmpeg.
9. **Timeline** \[Adding captions and music\]: scene duration = voice duration + pause. Group captions into 2 to 4 words. Pick the music.
10. **Render** \[Building your reel\]: call apps/render with the timeline JSON. Output MP4 (H.264, 1080x1920, 30 fps, AAC audio) and a thumbnail.
11. **Finish** \[Your reel is ready\]: upload to R2, update the project, settle credits, create an in-app notification.

**Failure handling:** every step retries twice with backoff. A permanent failure sets a friendly error key, refunds credits per A10 and offers a Try again button. Re-running a job must never double-charge or double-generate. Job timeout is 15 minutes.

## B2. Recipe schema (stored in recipes.config)

Every niche is a recipe, so adding a niche means adding data, not code. Fields: hook\_styles (name, pattern, two original examples), structure\_beats (name, purpose, share of runtime), pacing (words per second, sentence length range, seconds per scene), narrator (persona, tone, energy curve, pause map with after\_hook\_ms, after\_emotional\_line\_ms, before\_reveal\_ms, final\_beat\_ms), voice\_tags (mood to audio-tag map such as \[softly\], \[whispers\], \[sighs\]), visual\_mood (palette, lighting, camera language, symbolic motifs), allowed\_styles, character\_required, max\_characters, music\_mood, caption\_style, motion\_defaults, ending\_types (loop-back, question, save, share), forbidden (things never to write), length\_defaults.

## B3. Starter niches to seed (all examples are original)

**Psychology and mind**

- **Motivation and quotes.** Hooks: a hard truth ('Nobody is coming to save your year.'), a challenge, a reframe. Beats: hook, truth, example, turn, action line, echo of the hook. Tone: firm, rising energy, short punchy sentences, 600 ms pause before the punchline. Visuals: cinematic symbolic scenes (lone figure, sunrise, stairs, city rain), no character. Music: building cinematic.
- **Emotional storytelling.** Hook: a moment in the middle of a feeling. Beats: moment, two lines of backstory, turning point, quiet realization, gentle close. Tone: warm, intimate, slower, 900 ms pause after emotional lines. Visuals: soft moody scenes, character optional.
- **Human relationships.** Hooks: signs and patterns ('If they do this, it is not love.'), a direct question. Beats: hook, three signs, why it happens, what to do, a relatable closing line. Tone: friend-like and honest. Visuals: everyday scenes and symbolic objects, character optional.
- **Loneliness and inner life.** Hook: a quiet 'you' statement ('There is a kind of loneliness you can feel in a full room.'). Beats: name the feeling, show it, explain it gently, one small step, gentle close. Tone: soft, slow, low energy, 1,000 ms pauses after heavy lines, \[softly\]. Visuals: empty rooms, windows, rain, twilight, no recurring character. Music: soft piano ambient. Never diagnose or give medical claims. If the topic involves self-harm or suicide, do not generate a reel: show a caring message that encourages the user to reach out to someone they trust or a local support service.

**Stoic and motivational quotes.** Hook: a quote or its modern twist. Beats: quote, meaning, an everyday example, one action. Never invent quotes or attributions: use public-domain quotes or clearly paraphrase. Visuals: marble, dusk, statues, calm.

**Horror and mystery stories.** Hook: start in the middle of something wrong. Beats: cold open, brief normal world, first wrong detail, escalation twice, silence, reveal, final sting. Tone: low whisper settling into calm, slow, 1,200 ms silence before the reveal, \[whispers\]. Visuals: low-key light, fog, shadows. Character required, 1 or 2 recurring characters. Music: low drones with real silences. Forbidden: graphic gore, sexual content, real people, harm to children.

**Short animated stories.** Hook: begin at the crisis, then rewind. Beats: crisis flash, setup, goal, obstacle twice, twist, resolution, echo or moral. Tone: warm narrator with changing emotion. Visuals: animated styles. Character required.

**Bible stories and verses.** Hook: a question or a surprising detail from the text. Beats: setting, event, turning point, meaning today, a closing blessing-style line. Tone: reverent, steady, warm. Visuals: respectful painterly or cinematic. Rules: stay faithful to the text, never invent quotes or put new words in the mouths of biblical figures as if they were scripture, label any modern reflection as a reflection, never mock any faith.

## B4. Prompt templates

Variables are in {braces}. Store all prompts in the database or config, versioned, never inline in code.

**Hook generator (cheap model):** You write opening lines for short vertical videos. Niche: {sub\_niche}. Language: {reel\_language}. Topic: {topic}. Allowed hook styles: {hook\_styles}. Write 5 different hooks of 12 words or fewer, in spoken style, each creating a question the viewer must have answered. No greetings, no clichés, no 'Did you know'. Return JSON: \[{text, style, why}\]. A second call scores each hook from 1 to 10 for curiosity, clarity and brevity and returns the best.

**Script writer (Claude):** You are a professional short-form storyteller. Write the narration for a {duration}-second reel (about {word\_target} words) in {reel\_language}, as a native writer and not as a translation. Follow these beats: {beats}. Tone: {tone}. Start with this hook: {hook}. Rules: the first sentence must work with no context; sentences of 6 to 12 words; one idea per sentence; concrete images over abstractions; open a question early and answer it only near the end; vary the rhythm; no filler, no greetings, no 'in this video'; echo the hook at the end so the reel loops; finish with {ending\_type}; never include stage directions. Never write: {forbidden}. Return only the narration.

**Editor (Claude):** You are a retention editor for short videos. Find every moment a viewer could swipe away: slow openings, repeated ideas, vague lines, long sentences. Rewrite to fix them while keeping the story and the language. Check that the hook is under 3 seconds when spoken, the ending echoes the hook, no sentence is over 14 words, and nothing breaks {forbidden}. Return JSON {script, changes, hook\_score, ending\_score}. If either score is under 8, rewrite once more.

**Scene splitter (Claude):** Split the script into {scene\_count} scenes (plus or minus 1). Return JSON only: {scenes:\[{narration\_text, delivery\_tags, pause\_after\_ms, image\_prompt, motion\_preset, transition\_preset, on\_screen\_text}\]}. image\_prompt rules: written in English; describe subject, action, setting, lighting, camera angle and mood; no text inside the image; no real people or brands; different from the neighbouring scenes; ends with the style anchor {style\_card}; for character reels refer to the character by label {character\_label} and include the character card. delivery\_tags only from {voice\_tags}. pause\_after\_ms from the recipe pause map. Motion and transition presets only from the allowed lists in B5.

**Final image prompt:** scene image\_prompt + style card + (character card + 'same character as the reference image') + 'vertical 9:16, no text, no watermark, no extra fingers, no distorted faces'.

**Consistency checker (cheap vision model):** Compare image A (the master character) with image B (the new scene). Return JSON {same\_character 0 to 10, style\_match 0 to 10, defects:\[\]}. Defects include extra limbs, garbled text, wrong clothing, wrong hair. Pass mark is 7 or more on both scores with no defects.

**Moderation (cheap model):** Classify the topic against sexual content, minors in danger, graphic violence, hate, self-harm, deepfakes of real people, medical or legal advice presented as fact, and illegal activity. Return allow, rewrite or refuse with a friendly reason key.

## B5. Visual system

**Styles to seed** (the difficulty sets the credit multiplier: easy 1.0, medium 1.0, hard 1.5):

- Easy: stickman, flat illustration.
- Medium: comic book, Japanese anime, Chinese animation (ink and gold, epic tone), 3D animated.
- Hard: cinematic realistic, realistic human characters.

Each style has a style card of about 60 words that locks the medium, line quality, palette, lighting and camera. Example, Japanese anime: 'Japanese anime film still, clean line art, soft cel shading, expressive eyes, painted skies, warm cinematic lighting, shallow depth of field.' Example, Chinese animation: 'Chinese animated epic, ink-wash textures with gold highlights, flowing fabric, misty mountains, dramatic wide framing, rich red and jade palette.' Write the other cards in the same way.

**Launch rule:** before a style is switched on, generate 30 images of the same character in it. Only styles with at least 85% passing the quality gate go live. The active flag controls this.

**Character flow:**

1. The user picks a style.
2. They describe the character or choose a preset (age range, gender, hair, outfit, mood), or upload a reference image (with the rights checkbox).
3. The AI makes 4 portraits and the user picks one. That becomes the **master picture**.
4. The app writes a **character card**: fixed text covering age, face shape, hair, clothing, colors and one signature item.
5. The character is saved to the library for reuse. A reel can use at most 2 characters.
6. Every scene request sends the master picture or pictures, the character card, the style card and the scene action together. Seed at least 6 preset characters per style, made by our own pipeline.

**Motion presets (Remotion):** slow\_zoom\_in, slow\_zoom\_out, pan\_left, pan\_right, pan\_up, pan\_down, push\_in, handheld\_float, shake\_subtle (horror only). **Transition presets:** crossfade, dip\_to\_black, slide, whip\_pan, light\_leak, glitch\_cut (horror only). **Motion rules:** never the same motion twice in a row; the first scene is already moving at frame one; scenes last 2 to 4 seconds; the first scene is 2.5 seconds or less; maximum scale change 1.15.

**Caption presets:** bold pop (word-by-word highlight in orange), minimal, karaoke, cinematic (soft serif for emotional niches). 2 to 4 words per caption, maximum 2 lines, font size 64px or larger with a stroke or soft shadow, accented characters supported. Safe zones: keep key content in the central 1080x1500 area, captions at about 62 to 70 percent of the screen height, and keep clear of the top 12% and bottom 20% where platform buttons sit.

**Watermark (free plan only):** a small Reely AI mark in the safe area.

## B6. Voice

- Curate at least 6 voices per reel language (3 female, 3 male, different tones), each with an 8-second preview. The recipe sets the default voice tone. Speed control from 0.9 to 1.1.
- Premium voices use audio tags for emotion. Generate sentence by sentence. Do not overuse tags. If a tag is spoken aloud, strip it and regenerate. Normalize loudness to about -16 LUFS.
- Never clone the voice of a real or famous person. Users may upload their own voice recording with the rights checkbox (this step then costs 0 credits).

## B7. Music

- Library tracks are tagged by mood, niche and duration. The recipe picks 3 suggestions automatically and the user can preview and change them.
- Mix: music about -18 dB under the voice and about -10 dB in voice-free moments, fade in 0.5 s, fade out 1.5 s, loop or trim to length.
- User uploads: mp3, wav or m4a, up to 20 MB and 3 minutes, with a rights checkbox, file-type validation and loudness normalization. Uploaded music costs 0 credits.

---

# PART C — SCREENS AND FLOWS

For every screen: mobile-first, empty and loading and error states designed, and the TEXT AUDIT from A7 delivered.

**Landing page (public, SEO-ready):** hero with a short headline, one supporting line, a primary button 'Create your first reel' and a secondary 'See how it works'; a looping showcase of real sample reels made by our own pipeline; how it works in 3 steps; niches; styles; features (strong hooks, same character in every scene, voices in your language, your own music and images); pricing for Free, Starter, Creator and Pro with credits and approximate reel counts; 8 real FAQ items; final call to action; footer with Terms, Privacy, Contact and WhatsApp support. Write real, short, benefit-led English copy. Draft Terms and Privacy pages and flag them for legal review in your hand-off notes, not in the UI.

**Auth:** email and password, Google sign-in, password reset. After sign-up, ask the user to verify their phone number with an OTP to claim the free credits (country code selector). Friendly errors only.

**Onboarding (3 quick steps, skippable):** choose the default reel language, pick up to 3 niches of interest, then start a guided first reel using the free credits.

**Home:** credits card with a Buy credits button, a quick-create card with niche chips, a grid of recent reels, and a renewal banner when a plan is within 3 days of expiry. Empty state when there are no reels.

**Create wizard (full screen, stepper, back and next, a sticky live credit total at the bottom):**

1. **Niche:** niche cards, then sub-niche chips.
2. **Idea:** a text box for the topic, a Surprise me button (the AI picks a fresh angle), and the reel language selector.
3. **Look:** style cards (active styles only). If the recipe needs a character, or the user switches on a recurring character, show the character picker and creator.
4. **Sound:** voice picker with previews and a tier badge, speed, three suggested tracks, Browse library, Upload your own, and the caption style.
5. **Length and review:** length control (30, 60, 90 seconds), a summary, the credit breakdown (script, images, voice, export) and the Generate button. If credits are short, open a bottom sheet to buy.

**Progress screen:** a friendly animated stepper with the current step label and an estimated time. The user can leave and be notified in the app. Partial results appear as they finish: the script first, then images.

**Reel page:** a 9:16 player, a primary Download MP4 button, a Download thumbnail button and the title. A Script and scenes tab lets the user edit narration per scene, regenerate a scene image (the credit price is shown before confirming), change motion, music or voice, then re-render only what changed. A Details tab shows niche, style, length and credits used. Delete is available.

**Library:** reel grid with niche and date filters, search and status badges (Ready, Creating, Failed with a retry button). **Characters:** list, create, rename, delete, each showing the master picture and its card. **My uploads:** images, audio and voice recordings, with delete.

**Credits and billing:** balance split into plan credits and top-up credits with expiry dates; the plan card with a Renew button; the ledger with friendly reason names; receipts; buy a top-up. The checkout shows the base price, a 3% fee line, the total in XAF, the payment method (MTN or Orange Money) and clear success and failure states.

**Settings:** name, phone (with verified state), default reel language, delete account (full data deletion), sign out. No UI language selector and no theme selector in version 1.

**Help:** a short FAQ and a WhatsApp support link read from an environment variable. A Report a problem button on every reel.

**Admin (/admin, admin role only, desktop-first but usable on tablet):**

- Overview: revenue, payments, active users, reels generated, real provider cost against credits sold (margin), failed-job rate.
- Users: search, view credits, adjust credits with a reason, suspend.
- Payments: list, status, manual reconcile, refund.
- Pricing: price\_table and plans editors with change history.
- Niches and recipes: create and edit niches, sub-niches and recipes with a validated form editor, versioning, and a test button that runs only the script step.
- Styles: style cards, difficulty, active flag, consistency test results.
- Voices and Music: add, tag, preview, license note, activate or deactivate.
- Jobs: live queue, failures with error codes, retry or refund.
- Providers: model IDs, health, daily cost.
- Reports: user content reports.
- Settings: daily cost alert threshold, free grant amount, feature flags.
- Every admin action is written to audit\_log.

---

# PART D — QUALITY, SECURITY AND OPERATIONS

## D1. Security and privacy

- Row Level Security on every table, tested with two separate accounts. Secrets are server-only. Signed R2 URLs expire after 15 minutes.
- Validate every upload (type, size, file signature) and every input length. Rate-limit sign-in, generation and payment endpoints per user and per IP. Verify webhook signatures. Send a Content Security Policy. Protect admin routes on the server, not only in the UI.
- Never write user scripts or content into logs. Account deletion removes database rows and stored files. Use privacy-friendly analytics that never record content.

## D2. Content safety and rights

- Run the moderation step on every topic. Every reel has a Report a problem button. Uploads need a rights checkbox. No impersonation or deepfakes of real people, no sexual content, no content that harms children. Keep a simple takedown process and log every action.

## D3. Performance (many users will be on slow mobile networks)

- Aim for a fast first load on 4G: small bundles, lazy loading, optimized images, skeleton loaders, cached app shell.
- Handle flaky connections with retries. A job keeps running on the server when the user leaves, and the user finds the result later.
- Offer a lower-bitrate preview in the player and the full MP4 for download.

## D4. Observability

- Error tracking (Sentry), structured logs, a job dashboard, real cost per call in generation\_costs, and alerts for a high failed-job rate and for the daily cost threshold.

## D5. Testing

- Unit tests for the credit calculator, fee calculation and ledger. Integration tests for webhook idempotency and row-level security. End-to-end tests (Playwright) for: sign up, buy credits (mock), create a reel with mock providers, download.
- Provide a mock mode for every provider so local development costs nothing.
- Visual checks at 360, 390, 768 and 1280 pixels wide.

## D6. Environment variables (provide a .env.example with no real values)

APP\_BASE\_URL, SUPABASE\_URL, SUPABASE\_ANON\_KEY, SUPABASE\_SERVICE\_ROLE\_KEY, ANTHROPIC\_API\_KEY, GEMINI\_API\_KEY, CLOUDFLARE\_ACCOUNT\_ID, CLOUDFLARE\_API\_TOKEN, R2\_ACCOUNT\_ID, R2\_ACCESS\_KEY\_ID, R2\_SECRET\_ACCESS\_KEY, R2\_BUCKET, ELEVENLABS\_API\_KEY, INNGEST\_EVENT\_KEY, INNGEST\_SIGNING\_KEY, RENDER\_SERVICE\_URL, RENDER\_SERVICE\_SECRET, PAYMENT\_PROVIDER, FUTURA\_PAY\_\* (to be supplied by the owner), SMS\_OTP\_PROVIDER\_\* (to be chosen), SENTRY\_DSN, WHATSAPP\_SUPPORT\_URL.

## D7. Deployment

- Web app on Vercel or Cloudflare Pages. Render service on a VPS with Docker (Remotion, FFmpeg and Kokoro), limited to 2 simultaneous renders, with automatic restart, a health check and a shared secret. A staging environment before production. Backups for the database.

---

# PART E — PHASE PROMPTS (paste one at a time)

Every phase ends with the same delivery: a short summary of what was built, the TEXT AUDIT table, a list of anything unfinished, and what you need from me.

## Phase 0 — Foundation and design system

**Build:** the monorepo and tooling, Tailwind tokens from A6, fonts, all reusable components, the mobile tab bar and desktop sidebar shells, the i18n scaffold with messages/en.json, the PWA manifest and icons. Do not create visible placeholder pages: build real screens only in their own phases. A component gallery may exist for development but must be excluded from production builds. **Acceptance:** all components render in orange and white only; the app is installable; no hard-coded strings; no dark-mode styles; the console is clean.

## Phase 1 — Auth, database and security

**Build:** all migrations from A9 with Row Level Security, language seeds, email, Google and phone-OTP sign-in, profiles, onboarding, route guards. **Acceptance:** two-account RLS tests pass; sign-up, sign-in, sign-out and password reset work; the free grant is given once per verified phone number.

## Phase 2 — Credits, plans and payments

**Build:** credit lots, ledger, price table, the calculator in packages/shared, plans, the checkout with the 3% fee line, the PaymentProvider interface with the development-only mock, an idempotent webhook handler, billing pages and receipts. The Futura Pay adapter is added as soon as the owner supplies the documentation. **Acceptance:** quotes match the examples in A10 (232, 352, 178, 141, 338); the Starter checkout total is 3,605 XAF; a repeated webhook never grants credits twice; a negative balance is impossible.

## Phase 3 — Recipes and the script engine

**Build:** seed the niches and recipes from B3, the Claude and Gemini Flash-Lite adapters, the hook, script, editor and scene-split steps, schema validation, moderation, and an admin test page that runs only the script step. **Acceptance:** for every seeded sub-niche, generate 5 scripts in English and 5 in French; the JSON is valid every time; hooks are 12 words or fewer. Show me the outputs so I can read them.

## Phase 4 — Images, styles and characters

**Build:** the ImageProvider adapters (Nano Banana 2 Lite, Nano Banana 2.1, Flux), style cards, the character creation flow, master pictures, the quality gate with retries, cost logging, and a consistency test harness that generates 30 images per style. **Acceptance:** a report with the pass rate per style; styles under 85% are switched off; real image cost per call is logged.

## Phase 5 — Voice, captions and music

**Build:** the voice adapters (ElevenLabs and Kokoro), the voice library, sentence-level generation, silence insertion, timestamps, caption timing, the music library, uploads and mixing. **Acceptance:** a 60-second narration in English, French and Spanish; caption timing within 100 ms; loudness within the spec in B6.

## Phase 6 — Render service

**Build:** apps/render with the Remotion compositions (motion, transitions, caption presets, watermark), FFmpeg mixing, a render queue limited to 2 jobs, access protected by a shared secret, and the timeline JSON schema. **Acceptance:** test reels of 30, 60 and 90 seconds, 1080x1920, H.264; report the render time and file size on the target VPS.

## Phase 7 — The create flow, end to end

**Build:** the generate-reel workflow, the wizard, the progress screen with Realtime updates, the reel page with scene editing, the library, credit reserve and settle, and the failure and refund paths. **Acceptance:** a full run for every recipe; a deliberately failed step is refunded; no double charges; the user can leave and come back to the finished reel.

## Phase 8 — Admin dashboard

**Build:** every admin module in Part C, the audit log and the margin view. **Acceptance:** changing a price in the price table changes the next quote; a credit adjustment writes both a ledger entry and an audit entry.

## Phase 9 — Landing page, PWA polish and accessibility

**Build:** the landing page, SEO metadata, social preview images, sitemap, legal pages, the install prompt, the offline app shell, keyboard and screen-reader support, and a performance pass. **Acceptance:** mobile Lighthouse scores of 90 or more for performance, accessibility and best practices; the TEXT AUDIT passes on every screen.

## Phase 10 — QA and launch

**Build:** the full test matrix, responsive checks, a security checklist, a live Futura Pay test with a small real payment, a cost report, seed content, backups, monitoring, the move from staging to production, and the README, runbook and .env.example. **Acceptance:** every checklist item is ticked and any open issue is listed.

---

# PART F — DEFINITION OF DONE AND OPEN ITEMS

## Definition of done (every feature)

Works on a 360px phone and on desktop; the TEXT AUDIT passed; no console errors; strict TypeScript with no any; tests pass; credits and ledger stay consistent; documentation updated.

## Never do this

- Do not invent API endpoints, keys or prices.
- Do not add features outside the scope in A3, and do not build auto-posting.
- Do not hard-code text, prices, model IDs or prompts.
- Do not call providers from the browser.
- Do not leave mock or demo code reachable in production.
- Do not show provider names, raw errors or IDs to users.
- Do not add dark mode.

## Ask the owner, do not guess

1. Futura Pay: API documentation, keys, webhook signature method and checkout type.
2. The SMS or WhatsApp OTP provider.
3. The domain name.
4. Written confirmation of the music provider's license for use inside our app.
5. The expiry rule for top-up credits.
6. The ElevenLabs plan and the chosen voice IDs.
7. The real price of Nano Banana 2.1 (set the character-image credit price after testing).
8. The support WhatsApp number and the final legal text.
