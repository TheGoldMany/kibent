# Kibent – Hibrid & Remote Csapatnaptár

Ingyenes, multi-tenant csapatnaptár KKV-knak és startupoknak: ki van bent az irodában, ki dolgozik otthonról, ki van szabadságon vagy betegszabadságon.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript strict · Tailwind + shadcn/ui · **Neon** Postgres (projekt: `kibent-oltp`) + RLS · **Neon Auth** · **Vercel Blob** (privát) · `ical-generator` · `date-fns` (hu) · `zod`

## Funkciók

- **Csapatnaptár mátrix:** heti, kéthetes és havi nézet, napi irodai létszám (`🏢 6/12 fő`), ragadós névoszlop mobilon.
- **Kétkattintásos tervezés:** a saját cellára kattintva Iroda ↔ Home Office, optimista UI-jal (`useOptimistic`); a ↺ ikonnal visszaállítható a heti rutin.
- **Ismétlődő heti rutin:** alapértelmezett H–P beosztás, amelyet a napi bejegyzések felülírnak.
- **Szabadság:** időszak kiválasztása (a hétvégéket kihagyja), adminisztrátori jóváhagyás egy kattintással, „Függőben” jelzés a naptárban.
- **Betegszabadság:** nincs jóváhagyás; az orvosi igazolás (PDF/JPG/PNG, max. 10 MB) privát Vercel Blob tárolóba kerül, és **csak a feltöltő meg az adminok** láthatják, 60 másodpercig érvényes aláírt URL-lel.
- **Belépés:** email + jelszó, regisztráció vagy magic link (Neon Auth).
- **Meghívás:** 8 karakteres meghívókód / link, amely újragenerálható; szerepkörök kezelése és tagok eltávolítása.
- **Élő iCal feed:** `/api/ical/{token}/calendar.ics` (opcionálisan `?team=1`), Google, Apple és Outlook naptárral is működik.

## Telepítés

### 1. Neon (`kibent-oltp`)

1. A [Neon konzolban](https://console.neon.tech) nyisd meg a **kibent-oltp** projektet.
2. **Auth** fül → kapcsold be a **Neon Auth**-ot. Ez létrehozza a `neon_auth` sémát, és erre a migráció hivatkozik.
   - Engedélyezd az *Email & Password* és a *Magic link* belépést.
   - A *Trusted domains / Redirect URLs* közé vedd fel: `http://localhost:3000` és az éles domained.
3. Másold ki a **Base URL**-t (`NEON_AUTH_BASE_URL`) és a **pooled** connection stringet (`DATABASE_URL`).
4. Futtasd a migrációt (`psql` kell hozzá):

```bash
DATABASE_URL='postgresql://neondb_owner:…@…-pooler…neon.tech/neondb?sslmode=require' npm run db:migrate
```

### 2. Vercel Blob (privát)

Vercel → **Storage → Blob → Create**, és válaszd a **Private** hozzáférést. Kapcsold a projekthez: ez beállítja a `BLOB_READ_WRITE_TOKEN`-t. Helyi fejlesztéshez:

```bash
vercel env pull .env.local
```

### 3. Környezeti változók

```bash
cp .env.example .env.local
```

| Változó | Leírás |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string (tulajdonos szerepkörrel, pl. `neondb_owner`) |
| `NEON_AUTH_BASE_URL` | Neon konzol → Auth → Configuration |
| `NEON_AUTH_COOKIE_SECRET` | min. 32 karakteres titok: `openssl rand -base64 32` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store tokenje |
| `NEXT_PUBLIC_SITE_URL` | az alkalmazás nyilvános URL-je (meghívó, naptár linkek, auth visszairányítás) |

### 4. Futtatás

```bash
npm install
```

```bash
npm run dev
```

## Ellenőrzés

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

Helyi PostgreSQL-lel, a Neon Auth `neon_auth."user"` táblájának csonkjával:

- **RLS és üzleti szabályok** (46 ellenőrzés: tenant-izoláció, jóváhagyás, igazolások láthatósága, szerepkörök):

```bash
npm run test:db
```

- **Integráció**: a valódi server actionök és az iCal route futnak egy friss adatbázison, csak a Neon Auth session és a Blob van helyettesítve.

```bash
npm run test:integration
```

## Biztonsági modell röviden

- A felhasználókat a **Neon Auth** kezeli (`neon_auth."user"`). Egy trigger minden új felhasználóhoz létrehozza a `profiles` sort.
- Minden felhasználói kérés **egy tranzakcióban** fut (`src/lib/db.ts → withUser`):
  `SET LOCAL ROLE kibent_app` és `set_config('app.user_id', …)`. Így minden lekérdezésre érvényesek az RLS szabályok (`app.uid()`), akkor is, ha egy server actionből hiányozna egy szűrés.
- A `kibent_app` szerepkör nem írhatja közvetlenül a `profiles.role`, `company_id` és `ical_token` mezőket, és céget sem hozhat létre. Ezek csak `SECURITY DEFINER` RPC-ken keresztül módosulnak: `create_company`, `join_company`, `set_member_role`, `remove_member`.
- A `schedules_guard` trigger kikényszeríti, hogy egy tag szabadsága csak `pending` lehessen, és hogy az admin más sorában kizárólag a jóváhagyási státuszt módosíthassa (`reviewed_by` automatikusan kitöltődik).
- Orvosi igazolás: a metaadatot (`medical_documents`) az RLS csak a feltöltőnek és a cég adminjainak mutatja. A fájl privát Vercel Blobban van (`{company_id}/{user_id}/{request_group_id}/…`), és aláírt URL csak RLS-ellenőrzés után készül, 60 másodpercre.
- Az iCal feed tulajdonosi kapcsolattal fut (`withSystem`), de kizárólag a tokenhez tartozó cég adatait kérdezi le, és megjegyzéseket nem tesz közzé. A token a Beállításokban újragenerálható.

## Mappastruktúra

```text
src/app/(auth)/        login, onboarding, auth server actionök
src/app/(dashboard)/   naptár (/), kérelmek, beállítások + server actionök
src/app/invite/[code]  meghívó landing
src/app/api/auth/…     Neon Auth proxy
src/app/api/ical/…     .ics feed
src/proxy.ts           route-védelem (Next.js 16 proxy)
src/components/        calendar/, requests/, settings/, layout/, ui/
src/lib/               db (pg + RLS), auth, blob, schedule-resolver, dátumok, ical, validációk
db/migrations/         SQL séma
db/tests/              helyi RLS és integrációs tesztek
```
