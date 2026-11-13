# Kibent – Hibrid & Remote Csapatnaptár

Ingyenes, multi-tenant csapatnaptár KKV-knak és startupoknak: ki van bent az irodában, ki dolgozik otthonról, ki van szabadságon vagy betegszabadságon.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript strict · Tailwind + shadcn/ui · **Neon** Postgres (projekt: `kibent-oltp`) + RLS · **Better Auth** (saját, az alkalmazáson belül) · **Resend** · **Vercel Blob** (privát) · `ical-generator` · `date-fns` (hu) · `zod`

## Funkciók

- **Csapatnaptár mátrix:** heti, kéthetes és havi nézet, napi irodai létszám (`🏢 6/12 fő`), ragadós névoszlop mobilon.
- **Kétkattintásos tervezés:** a saját cellára kattintva Iroda ↔ Home Office, optimista UI-jal (`useOptimistic`); a ↺ ikonnal visszaállítható a heti rutin.
- **Ismétlődő heti rutin:** alapértelmezett H–P beosztás, amelyet a napi bejegyzések felülírnak.
- **Szabadság:** időszak kiválasztása (a hétvégéket kihagyja), adminisztrátori jóváhagyás egy kattintással, „Függőben” jelzés a naptárban.
- **Betegszabadság:** nincs jóváhagyás; az orvosi igazolás (PDF/JPG/PNG, max. 10 MB) privát Vercel Blob tárolóba kerül, és **csak a feltöltő meg az adminok** láthatják, 60 másodpercig érvényes aláírt URL-lel.
- **Egyszerű regisztráció:** bárki regisztrálhat név + email + jelszó megadásával, és azonnal belép (nincs megerősítő levél). Jelszó nélkül emailes kóddal is be lehet lépni. Saját Better Auth, a felhasználók a Neon adatbázis `better_auth` sémájában.
- **Több csapat:** belépés után egy üres felület fogad, ahol egy vagy több csapatot hozhatsz létre (te leszel az admin). A fejlécben lévő csapatváltóval válthatsz köztük; minden csapatnak saját naptára, rutinja és munkaideje van.
- **Meghívás email címre:** az admin beírja a kollégák címét, mindenki személyes linket kap emailben. Akinek van fiókja, csak elfogadja; akinek nincs, a linkről regisztrál, és rögtön a csapatban van. Szerepkörök kezelése, tagok eltávolítása.
- **Munkaidő és ebédszünet:** mindenki maga állítja be napi bontásban; az ebédszünet hosszát az admin adja meg. A naptárban látszik, ki ebédel éppen.
- **Élő iCal feed:** `/api/ical/{token}/calendar.ics?c={csapat}` (opcionálisan `&team=1`), Google, Apple és Outlook naptárral is működik.

## Telepítés

### 1. Neon (`kibent-oltp`)

1. A [Neon konzolban](https://console.neon.tech) nyisd meg a **kibent-oltp** projektet.
2. A bejelentkezést az alkalmazás maga kezeli (Better Auth); a Neon Auth-ot nem kell bekapcsolni. A `better_auth` sémát (0004) és a több-csapatos tagságokat (0005) az alkalmazás az első induláskor automatikusan létrehozza.
3. Másold ki a **pooled** connection stringet (`DATABASE_URL`).
4. Futtasd a migrációkat sorrendben (`0001_init.sql`, `0002_work_hours_invitations.sql`): vagy a Neon **SQL Editorban** (másold be a fájlok tartalmát), vagy `psql`-lel:

```bash
DATABASE_URL='postgresql://neondb_owner:…@…-pooler…neon.tech/neondb?sslmode=require' npm run db:migrate
```

A migrációk a régi Neon Auth sémára vonatkozó lépéseket `WARNING`-gal kihagyják, ha az nem létezik vagy nincs rá jog – ez nem hiba.

Ellenőrzés a migráció után (várt eredmény: `5 | 16 | 0 vagy 1 | 1`):

```sql
select (select count(*) from information_schema.tables where table_schema = 'public') as tablak,
       (select count(*) from pg_policies where schemaname = 'public') as rls_szabalyok,
       (select count(*) from pg_trigger where tgname = 'on_auth_user_created') as auth_trigger,
       (select count(*) from pg_roles where rolname = 'kibent_app') as app_szerepkor;
```

Ha egy korábbi futtatás félbeszakadt (`relation "companies" already exists`), előbb futtasd a `db/reset_partial.sql`-t. Ez csak üres táblák esetén töröl, a felhasználókhoz nem nyúl. Utána futtasd újra a migrációt.

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
| `BETTER_AUTH_SECRET` | min. 32 karakteres titok: `openssl rand -base64 32` (nélküle a régi `NEON_AUTH_COOKIE_SECRET`-et használja) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store tokenje |
| `RESEND_API_KEY` | Resend API kulcs a meghívó és belépő kód emailekhez (Vercelen a **Production** környezetben is kell; nélküle a meghívó link kézzel másolható) |
| `EMAIL_FROM` | feladó, pl. `Kibent <meghivo@kibent.hu>` (a domaint a Resendben hitelesíteni kell) |
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

Helyi PostgreSQL-lel:

- **RLS és üzleti szabályok** (85 ellenőrzés: tenant-izoláció, több csapat és aktív csapat, meghívók, jóváhagyás, igazolások láthatósága, szerepkörök):

```bash
npm run test:db
```

- **Integráció**: a valódi server actionök és az iCal route futnak egy friss adatbázison, csak a munkamenet és a Blob van helyettesítve.

```bash
npm run test:integration
```

## Biztonsági modell röviden

- A felhasználókat a saját **Better Auth** kezeli a `better_auth` sémában, amelyhez az alkalmazás korlátozott szerepköre nem fér hozzá. A `profiles` sor az első belépéskor jön létre. Mivel nincs email-megerősítés, az email cím önmagában semmilyen jogot nem ad: csapatba csak saját létrehozással vagy a meghívó linkjével lehet bekerülni (a link birtoklása a bizonyíték).
- A tagságokat a `memberships` tábla tárolja (felhasználó × csapat × szerepkör). Az aktív csapatot süti választja ki, de a szerver minden kérésnél ellenőrzi a tagságot, és az RLS is csak az aktív csapat adatait engedi (`app.company_id`).
- A kódkérés és a belépés korlátozva van.
- Minden felhasználói kérés **egy tranzakcióban** fut (`src/lib/db.ts → withUser`):
  `SET LOCAL ROLE kibent_app`, `set_config('app.user_id', …)` és `set_config('app.company_id', …)`. Így minden lekérdezésre érvényesek az RLS szabályok (`app.uid()`), akkor is, ha egy server actionből hiányozna egy szűrés.
- A `kibent_app` szerepkör nem írhatja közvetlenül a tagságokat és az `ical_token` mezőt, és csapatot sem hozhat létre. Ezek csak `SECURITY DEFINER` RPC-ken keresztül módosulnak: `create_company`, `accept_invitation`, `set_member_role`, `remove_member`.
- A `schedules_guard` trigger kikényszeríti, hogy egy tag szabadsága csak `pending` lehessen, és hogy az admin más sorában kizárólag a jóváhagyási státuszt módosíthassa (`reviewed_by` automatikusan kitöltődik).
- Orvosi igazolás: a metaadatot (`medical_documents`) az RLS csak a feltöltőnek és a cég adminjainak mutatja. A fájl privát Vercel Blobban van (`{company_id}/{user_id}/{request_group_id}/…`), és aláírt URL csak RLS-ellenőrzés után készül, 60 másodpercre.
- Az iCal feed tulajdonosi kapcsolattal fut (`withSystem`), de kizárólag a token gazdájának egy olyan csapatát kérdezi le, amelynek tagja, és megjegyzéseket nem tesz közzé. A token a Beállításokban újragenerálható.

## Mappastruktúra

```text
src/app/(auth)/        login, auth és csapat server actionök
src/app/(dashboard)/   naptár / üres felület (/), kérelmek, beállítások + server actionök
src/app/invite/[token] meghívó elfogadása
src/app/api/auth/…     Better Auth végpontok
src/app/api/ical/…     .ics feed
src/proxy.ts           route-védelem (Next.js 16 proxy)
src/components/        calendar/, requests/, settings/, teams/, layout/, ui/
src/lib/               db (pg + RLS), auth, blob, schedule-resolver, dátumok, ical, validációk
db/migrations/         SQL séma
db/tests/              helyi RLS és integrációs tesztek
```
