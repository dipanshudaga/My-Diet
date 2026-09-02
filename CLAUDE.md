# CLAUDE.md

This file is the persistent context for this repository. Read it fully before doing any work here.

## Project overview

"My Diet" is a **single-user, personal** diet-tracking web app. The owner (and only user) goes to the gym regularly and eats a mostly-consistent, weighed diet. The core interaction is a **chat-style log**: the user types a free-form sentence describing what they ate (e.g. "60g oats, grated 10 almonds, 2 walnuts, 350g milk, one spoon peanut butter") or uploads a photo (a nutrition label, a bowl of food, a supplement bottle), and the app parses it into structured food entries with calorie/macro/micronutrient estimates, which accumulate into a running daily total against personal targets.

This is not a multi-user product. Don't add auth complexity, multi-tenant data models, or generic "onboarding for any user" flows beyond what's needed for one person's Supabase Row Level Security.

## Non-negotiable constraints

- **Hosting is GitHub Pages** — static only. No server-side code, no custom backend, no CORS proxying. Anything that needs "server" behavior must either run client-side or use an external service callable directly from a browser (Supabase, Open Food Facts).
- **AI inference runs fully in-browser** via WebGPU. No cloud LLM API calls, no API keys for AI, no per-request cost. Target device is confirmed **iPhone on iOS 26 (Safari 26)**, which has full WebGPU support — treat this as the primary target, but still feature-detect `navigator.gpu` and degrade gracefully (structured-form-only entry, no AI) rather than fail silently on unsupported browsers.
- **Model weights are never committed to this repo.** GitHub Pages caps published sites around 1GB and individual files at 100MB; a quantized Gemma 4 E2B model is multiple GB. Models are fetched from the Hugging Face Hub at runtime and cached client-side (Cache Storage API / OPFS).
- **Keep it as lightweight and simple as possible.** This is a personal tool, not a product. Prefer fewer dependencies and less abstraction over "best practice" scaffolding that doesn't earn its keep for a single user.
- **Do not use `roboflow/supervision`.** It's a Python-only, server-side post-processing toolkit for object-detection output. It has no browser runtime and nothing here needs it — the vision-capable LLM handles image understanding directly.
- **Do not call the USDA FoodData Central API directly from the browser.** It does not support CORS. Use IFCT 2017 (bundled) and Open Food Facts (browser-callable) instead.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | React + TypeScript + Vite |
| Styling | Tailwind CSS |
| Local DB | Dexie.js (IndexedDB wrapper) — the source of truth for all reads/writes |
| Cloud DB | Supabase (Postgres + Auth) — optional sync layer, see Environment variables |
| On-device AI | Transformers.js v4 + WebGPU, model: Gemma 4 E2B instruction-tuned, ONNX build (e.g. `onnx-community/gemma-4-E2B-it-ONNX` on Hugging Face) |
| OCR | Tesseract.js (WASM, runs offline in a Web Worker) |
| Nutrition data | IFCT 2017 (Indian Food Composition Tables, bundled as static data) + Open Food Facts API (packaged/branded products) |
| PWA | `vite-plugin-pwa` (manifest + service worker, offline app-shell + installable) |
| Hosting/CI | GitHub Pages via a GitHub Actions workflow |

## Repository & deployment

- Repo: `https://github.com/dipanshudaga/My-Diet` — this is a **project page**, not a user page, so the deployed URL will be `https://dipanshudaga.github.io/My-Diet/`.
- Vite config **must** set `base: '/My-Diet/'` or all asset paths will 404 on Pages.
- Deploy via a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds on push to `main` and publishes to the `gh-pages` branch or Pages' native Actions deployment — either is fine, prefer the native `actions/deploy-pages` flow since it needs no extra branch.
- This repo is **public** (a deliberate choice — GitHub Pages on a private repo needs a paid plan, which this account doesn't have). Its seed data includes a daily supplement's label values (dosage, nutrients) alongside the food data — treat it the same as any other nutrition figure in the app, nothing framed as medical/diagnostic.

## Data & sync architecture

Everything is **local-first**: every write goes to Dexie (IndexedDB) immediately, synchronously with the UI — nothing waits on a network call. Supabase is a durable backup/cross-device copy, not the primary store.

- Sync pattern: local write → append to an in-memory/IndexedDB **sync queue** → flush to Supabase via REST when online → mark synced. On reconnect (`window.addEventListener('online', ...)`), retry the queue.
- Conflict resolution: simple **last-write-wins** keyed on an `updated_at` timestamp column. This is sufficient — there's one user, and even across two of their own devices this is fine. Do not reach for a CRDT sync engine (PowerSync/ElectricSQL/RxDB) — that solves a harder problem than exists here.
- Supabase requires *some* authenticated user for Row Level Security to scope data. Use Supabase magic-link (passwordless) auth for the single owner account — no need for a full auth UI, a single "sign in" screen is enough.
- **Raw photos are not persisted long-term.** Once an image has been parsed into structured nutrition data, discard it (don't upload to Supabase Storage, don't keep it in IndexedDB past the session). If a visual audit trail is wanted later, that's an explicit opt-in add-on, not a default.

## Data models

### Dexie (local) schema

```ts
// LogEntry — one per typed/photographed thing the user logs
interface LogEntry {
  id: string;                // uuid
  timestamp: string;         // ISO
  mealContext?: string;      // free text, optional e.g. "post-workout"
  rawInput: { text?: string; imageRefs?: string[] };
  parsedItems: ParsedItem[];
  totals: NutrientTotals;
  status: 'auto-saved' | 'edited' | 'confirmed';
  updatedAt: string;         // ISO, for sync conflict resolution
}

interface ParsedItem {
  name: string;
  quantity: number;
  unit: string;              // g, ml, "piece", "scoop", etc.
  source: 'known' | 'ifct' | 'off' | 'ocr' | 'estimated';
  confidence: 'high' | 'medium' | 'low';
  nutrients: NutrientTotals;
}

interface NutrientTotals {
  kcal: number; protein: number; carbs: number; fat: number;
  fiber: number; sugar: number; saturatedFat: number; transFat: number;
  cholesterol: number; sodium: number;
  vitaminA: number; vitaminD: number; vitaminE: number; vitaminK: number; vitaminC: number;
  b1: number; b2: number; b3: number; b6: number; folate: number; b12: number;
  calcium: number; iron: number; magnesium: number; zinc: number; potassium: number;
  phosphorus: number; selenium: number; copper: number; iodine: number; omega3: number;
  // all optional/nullable at the per-item level — not every source has every nutrient
}

// KnownProduct — the user's own scanned/derived product library, reused across days
interface KnownProduct {
  id: string;
  name: string;               // e.g. "Peanut Butter — Dark Chocolate & Whey, [brand]"
  per100g: NutrientTotals;
  source: 'ocr' | 'manual' | 'ifct' | 'off';
  lastUpdated: string;
}

// Profile — onboarding output, editable anytime
interface Profile {
  age: number; sex: 'male' | 'female';
  heightCm: number; weightKg: number;
  activityDaysPerWeek: number;
  goal: 'gain' | 'lose' | 'maintain';
  targets: NutrientTotals;    // computed by the goal engine, see below
}
```

### Supabase schema

Mirror the Dexie tables (`log_entries`, `known_products`, `profile`) as Postgres tables with an `updated_at timestamptz` column on each, RLS policies scoped to `auth.uid()`, and a `user_id` foreign key on every row.

## AI model integration

- **Model**: Gemma 4 E2B, instruction-tuned, ONNX build, loaded via **Transformers.js v4 + WebGPU**. This is the primary and only planned runtime — it has confirmed working multimodal (text+image) browser demos for this exact model. Do not use MediaPipe Tasks GenAI (Google's own runtime is in maintenance-mode) unless Transformers.js hits a specific blocker.
- Load the model **lazily on first use**, not on app boot — show a progress indicator during the (one-time, multi-GB) download, then cache via the Cache Storage API / OPFS so every subsequent load is instant and offline-capable.
- Offer **Gemma 4 E4B as an opt-in "more accurate" toggle** in settings for when the user is on a beefier device (bigger download, slower on weak hardware, better reasoning on messy free text) — not the default.
- **Prompting**: use a system prompt that defines a strict JSON output schema matching `ParsedItem[]` above, plus 2–3 few-shot examples written in the user's actual phrasing style (see "Seed diet reference" below — use those real sentences, not generic examples).
- **Composite/proportional dishes** (e.g. "sprouts chaat with black chana, moth, white chana, moong, soybean in decreasing proportion by weight" — no exact grams given) can't be split exactly. Prompt the model to make its best proportional estimate using typical ratios and flag the whole entry `confidence: 'low'` rather than blocking or asking the user to re-specify. A good estimate is the explicit bar here, not lab-grade precision.
- Feature-detect `navigator.gpu` before attempting to load the model; if unavailable, disable AI parsing and fall back to the structured manual-entry form.

## OCR integration

- **Tesseract.js**, run in a Web Worker, fully offline.
- Only invoke it for **label/packaging photos** (nutrition panels, supplement bottles) — not for photos of prepared food/bowls, where there's no text to extract.
- For label photos: run OCR and the vision-LLM read in parallel, then send both back to the model in a short reconciliation prompt ("here's the raw OCR text: X — here's what you read visually: Y — produce one final structured value, noting any mismatch"). This catches digit-transposition errors that vision-LLMs are prone to (e.g. reading 148 as 184).

## Nutrition data sources & resolution order

Resolve each food, in this order, stopping at the first hit:

1. **The user's own `KnownProduct` library** (Dexie/Supabase) — a specific product they've scanned or corrected before.
2. **IFCT 2017** — bundle the dataset's raw CSV/JSON files as static assets under `src/nutrition/ifct/data/` and query them client-side. This is the primary source for raw/whole/home-cooked Indian food — it already covers milk (doodh), chana, moong, atta, walnuts, almonds, etc. Note: the actively-maintained `ifct2017` package moved to AGPL-3.0 in April 2025; for this personal, source-available repo that's a non-issue, but if it matters later, an MIT-licensed pre-April-2025 snapshot of the same data exists.
3. **Open Food Facts API** (`https://world.openfoodfacts.org/api/v2/product/{barcode}.json` or the search endpoint) — no API key needed for reads, CORS-friendly. Use for branded packaged products (protein powder, peanut butter, oats brand) when not already in the known-product library.
4. **The model's own trained knowledge** as a last resort — always tag these `source: 'estimated'` so the UI can visibly flag them as unsourced, rather than presenting them with the same confidence as a scanned label.

When the user corrects a value on an entry, ask whether to also update the underlying `KnownProduct` (so the fix applies to future entries, not just this one) rather than silently doing either.

## Goal engine (Profile → targets)

Computed at onboarding, editable anytime from the Profile screen.

- **BMR**: Mifflin-St Jeor equation (needs age, sex, height, weight — collect biological sex in onboarding even though it wasn't explicitly requested, the formula requires it).
- **TDEE**: BMR × activity multiplier based on `activityDaysPerWeek`.
- **Calorie target**: TDEE adjusted by a surplus (gain, sized for lean gain with resistance training) or deficit (lose, moderate, preserving training performance) or unchanged (maintain).
- **Protein target**: set in g/kg bodyweight (not a flat number), at the higher end of typical ranges given regular gym training.
- **Micronutrient RDAs**: use **ICMR-NIN 2020** values (the Indian RDA standard) — this is the same standard already printed on the user's own oats packaging, so app targets and product labels will speak the same language. Do not use US/EU RDA tables.
- **Micronutrient scope** (~25 tracked): Vitamins A, D, E, K, C, B1, B2, B3, B6, B9 (folate), B12; Minerals calcium, iron, magnesium, zinc, potassium, sodium, phosphorus, selenium, copper, iodine; plus fiber, sugar, saturated fat, trans fat, cholesterol, omega-3.

## Folder structure

```
My-Diet/
├─ public/
│  └─ manifest.json
├─ src/
│  ├─ ai/
│  │  ├─ model.ts          # Transformers.js load/cache/inference wrapper
│  │  ├─ prompts.ts        # system prompt + few-shot examples (use seed diet data below)
│  │  └─ schema.ts         # JSON output schema + validation
│  ├─ ocr/
│  │  └─ tesseract.ts
│  ├─ nutrition/
│  │  ├─ ifct/
│  │  │  └─ data/          # bundled IFCT 2017 CSV/JSON
│  │  ├─ ifct.ts           # query helpers
│  │  ├─ openFoodFacts.ts  # API client
│  │  └─ resolve.ts        # resolution order logic
│  ├─ goals/
│  │  └─ engine.ts         # BMR/TDEE/target calculations
│  ├─ db/
│  │  ├─ dexie.ts          # local schema
│  │  └─ sync.ts           # Supabase sync queue
│  ├─ components/
│  │  ├─ LogInput/         # the chat-style text+photo entry UI — this is the core screen
│  │  ├─ TodayView/        # running totals vs targets
│  │  ├─ HistoryView/      # past days
│  │  ├─ FoodsLibrary/     # known products
│  │  └─ ProfileOnboarding/
│  └─ App.tsx
├─ .env.example
├─ vite.config.ts
└─ package.json
```

## Build phases

**Work through these one at a time, in order. After finishing a phase, stop, summarize what was built and how to try it, and wait for explicit go-ahead before starting the next phase. Do not cascade into the next phase automatically, even if the path forward seems obvious.**

- **Phase 0 — Seed data.** No app code yet. Build the IFCT 2017 data bundle and a starter `KnownProduct` seed set from the real foods in "Seed diet reference" below (oats, peanut butter, protein powder, NAC supplement — using the label values given).
- **Phase 1 — Static MVP.** Scaffold the Vite+React+TS+Tailwind app, Dexie schema, GitHub Pages deploy workflow. Build a plain structured-form logging UI (name/quantity/unit fields) writing to Dexie, and a Today view summing entries. **No AI yet.** This should be a working, deployable diary on its own.
- **Phase 2 — Free-text parsing.** Integrate Transformers.js + Gemma 4 E2B. Wire free-text input → model → `ParsedItem[]` → Dexie, using the schema and prompting approach above.
- **Phase 3 — Image input.** Photo upload, client-side downscale, vision parsing, Tesseract.js reconciliation for label photos.
- **Phase 4 — Goal engine.** Onboarding form, BMR/TDEE/target calculation, progress view on Today.
- **Phase 5 — Sync & offline.** Supabase schema + magic-link auth + sync queue, service worker via `vite-plugin-pwa`, installable manifest.
- **Phase 6 — Polish.** Confidence badges on entries, known-product reuse/correction flow, edge cases (composite dishes, missing nutrients).

## Seed diet reference (illustrative phrasing style)

Use this as seed data for Phase 0 and as few-shot examples in `prompts.ts` — it's an example of the target phrasing style (Indian gym-goer, grams-based, mixed English/Hindi terms like "doodh"), not a literal record of one person's daily life. Nutrition label values below are product facts, kept for Phase 0's seed data.

**Example log sentences:**
- One banana before the gym.
- During the gym: 3g creatine in 500ml water.
- After the gym: 1 multivitamin tablet (a discrete-dose supplement — stays in its natural unit, doesn't convert to grams).
- 200g sprouts chaat — black chana, moth, white chana, moong, soybean, in decreasing proportion by weight (no exact split given — estimate).
- Overnight oats, prepared the night before: 60g oats, 10 almonds (grated), 2 walnuts/akhrots (grated), 350g milk (doodh), plus one big spoon of peanut butter added before eating.
  - Oats label, per 100g: 369 kcal, 12.6g protein, 66.8g carbs, 10.4g fiber, 8g fat, 5mg sodium, 3.7mg iron, 115mg magnesium, 2.6mg zinc. Per 40g serving: 148 kcal, 5.0g protein, 26.7g carbs, 4.2g fiber, 3.2g fat.
- Protein shake — 2 scoops protein powder + 250g milk + 20g peanut butter, blended.
  - Protein powder label, per 100g / per 35g scoop: 386.0/135.1 kcal, 75.9g/26.5g protein (~26g protein per scoop per the label's own callout), 9.3g/3.2g carbs, <0.1g/<0.04g fiber, 5.0g/1.7g fat, 186.9mg/65.4mg sodium, 134.0mg/48.9mg cholesterol.
  - Peanut butter is a dark-chocolate-and-whey-protein variant (brand label was photographed but partially illegible on OCR — treat any exact numbers from it as low-confidence until re-scanned in-app).
- Lunch: 2 chapatis, 200g curd.
- Dinner: cooked vegetable, 2 chapatis.

## Coding conventions

- TypeScript strict mode on.
- Functional React components, hooks — no class components.
- Keep components small and colocated with their styles (Tailwind utility classes inline, no separate CSS files unless truly shared).
- Prefer explicit types over `any`; the `NutrientTotals`/`ParsedItem` types above are the contract between the AI layer, nutrition resolution, and storage — keep them in one place (`src/ai/schema.ts`) and import everywhere else.
- No test framework is required for this personal project unless asked for later — don't scaffold one unprompted.

## Explicit don'ts

- Don't commit model weights or large binaries to the repo.
- Don't call the USDA FoodData Central API from client code.
- Don't use `roboflow/supervision` or add a Python backend of any kind.
- Don't persist raw food photos to Supabase or long-term local storage.
- Don't build multi-user auth, tenancy, or generic "any user" onboarding — this is one person's app.
- Don't reach for a CRDT sync engine (PowerSync/ElectricSQL/RxDB) — plain last-write-wins is enough.
- Don't auto-advance to the next build phase without stopping for review first.

## Environment variables

Create `.env.example` (committed) with:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The actual secrets go in `.env.local` (gitignored by Vite's default `.gitignore` — verify this on scaffold). The app must run fully functionally on **local storage only** when these are unset or empty — Supabase sync activates automatically once they're filled in and a project exists. Don't block Phases 0–4 on Supabase being configured.
