# Kibent – Hibrid & Remote Csapatnaptár

Ingyenes, multi-tenant csapatnaptár KKV-knak és startupoknak: ki van bent az irodában, ki dolgozik otthonról, ki van szabadságon vagy betegszabadságon.

**Stack:** Next.js 15 (App Router, Server Actions) · TypeScript strict · Tailwind + shadcn/ui · Supabase (Postgres + RLS + privát Storage) · `ical-generator` · `date-fns` (hu) · `zod`

## Funkciók

- **Csapatnaptár mátrix:** heti, kéthetes és havi nézet, napi irodai létszám (`🏢 6/12 fő`), ragadós névoszlop mobilon.
- **Kétkattintásos tervezés:** a saját cellára kattintva Iroda ↔ Home Office, optimista UI-jal (`useOptimistic`); a ↺ ikonnal visszaállítható a heti rutin.
- **Ismétlődő heti rutin:** alapértelmezett H–P beosztás, amelyet a napi bejegyzések felülírnak.
- **Szabadság:** időszak kiválasztása (a hétvégéket kihagyja), adminisztrátori jóváhagyás egy kattintással, „Függőben” jelzés a naptárban.
- **Betegszabadság:** nincs jóváhagyás; az orvosi igazolás (PDF/JPG/PNG, max. 10 MB) privát bucketbe kerül, és **csak a feltöltő meg az adminok** láthatják, 60 másodpercig érvényes aláírt URL-lel.
- **Meghívás:** 8 karakteres meghívókód / link, amely újragenerálható; szerepkörök kezelése és tagok eltávolítása.
- **Élő iCal feed:** `/api/ical/{token}/calendar.ics` (opcionálisan `?team=1`), Google, Apple és Outlook naptárral is működik.

## Telepítés

### 1. Supabase projekt

1. Hozz létre egy ingyenes projektet a [supabase.com](https://supabase.com) oldalon.
2. Futtasd le a migrációt (az SQL Editorban, vagy a CLI-vel: `supabase db push`):
   `supabase/migrations/0001_init.sql`
   Ez létrehozza a táblákat, triggereket, RLS szabályokat és a privát `medical-docs` bucketet.
3. **Authentication → URL Configuration:**
   - *Site URL:* `http://localhost:3000` (élesben a saját domained)
   - *Redirect URLs:* `http://localhost:3000/auth/callback`, `https://<domain>/auth/callback`
4. *(Opcionális)* Ha az email megerősítést kikapcsolod (Authentication → Providers → Email → Confirm email), a regisztráció után azonnal be lehet lépni.

### 2. Környezeti változók

```bash
cp .env.example .env.local
```

| Változó | Leírás |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable kulcs |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role kulcs – **csak szerveren**, kizárólag az iCal feed használja |
| `NEXT_PUBLIC_SITE_URL` | az alkalmazás nyilvános URL-je (meghívó és naptár linkekhez) |

### 3. Futtatás

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
npm test
```

```bash
npm run build
```

Az RLS és az üzleti szabályok tesztje helyi PostgreSQL-lel, Supabase-stubbal fut (45 ellenőrzés: tenant-izoláció, jóváhagyási szabályok, igazolások láthatósága, szerepkörök):

```bash
bash supabase/tests/run.sh
```

(A `createdb`/`psql` parancsoknak elérhetőnek kell lenniük; szükség esetén `postgres` felhasználóként futtasd.)

## Biztonsági modell röviden

- Minden táblán RLS van; a `auth_company_id()` és az `is_company_admin()` `SECURITY DEFINER` segédfüggvények választják el a cégeket.
- A `profiles.role` és a `company_id` közvetlenül nem írható (oszlopszintű jogosultság), csak RPC-n keresztül: `create_company`, `join_company`, `set_member_role`, `remove_member`.
- A `schedules_guard` trigger kikényszeríti, hogy egy tag szabadsága csak `pending` lehessen, és hogy az admin más sorában kizárólag a jóváhagyási státuszt módosíthassa (`reviewed_by` automatikusan kitöltődik).
- Orvosi igazolások: a `medical_documents` táblát és a `medical-docs/{company_id}/{user_id}/{request_group_id}/…` storage útvonalat csak a feltöltő és a cég adminjai érik el. Más tag a rekord létezését sem látja.
- Az iCal feed service role kulccsal fut, de kizárólag a tokenhez tartozó cég adatait kérdezi le, és megjegyzéseket nem tesz közzé. A token a Beállításokban újragenerálható.

## Mappastruktúra

```text
src/app/(auth)/        login, onboarding, auth server actionök
src/app/(dashboard)/   naptár (/), kérelmek, beállítások + server actionök
src/app/invite/[code]  meghívó landing
src/app/api/ical/…     .ics feed
src/components/        calendar/, requests/, settings/, layout/, ui/
src/lib/               supabase kliensek, schedule-resolver, dátumok, ical, validációk
supabase/migrations/   SQL séma
supabase/tests/        helyi RLS tesztek
```
