# Pensjon Deployment Audit

En applikasjon for å overvåke deployments på Nav sin Nais-plattform og verifisere at alle har hatt "to sett av øyne" (four-eyes principle). **V2 bruker en applikasjon-sentrisk modell** med sikkerhetsvarsler for repository-endringer.

## ✨ Funksjoner

- 🔍 **Application Discovery**: Søk etter Nais teams og finn tilgjengelige applikasjoner
- 📦 **Deployment Tracking**: Automatisk synkronisering av deployments fra Nais
- ✅ **Four-Eyes Verification**: Automatisk sjekk av PR-godkjenninger
- 🚨 **Repository Alerts**: Varsler hvis deployment kommer fra uventet repository (sikkerhet!)
- 💬 **Kommentarer**: Legg til Slack-lenker for direct pushes
- 🎯 **Tertialtavler**: Koble deployments til tertialmål (tight-loose-tight)
- 📈 **Statistikk**: Oversikt over deployment-status

## 🏗️ Arkitektur V2

### Application-Centric Model

V2 bruker en applikasjon-sentrisk tilnærming:

```
Team + Environment + Application (primary entity)
  ├─ Approved Repository (forventet)
  ├─ Detected Repository (faktisk)
  └─ Deployments
      └─ Repository Alerts (hvis mismatch)
```

### Sikkerhet

Appen detekterer automatisk hvis en deployment kommer fra et annet repository enn forventet. Dette kan indikere at noen har "kapret" en applikasjon - slike varsler må sjekkes manuelt.

## Teknisk Stack

- **Framework**: React Router 7 med SSR
- **TypeScript**: For type-sikkerhet
- **Database**: PostgreSQL med application-centric schema
- **UI**: Nav Aksel designsystem v8
- **APIs**: 
  - Nais GraphQL API (application discovery og deployments)
  - GitHub REST API (PR-verifisering via Octokit)

## 🚀 Oppsett

### 1. Klon og installer dependencies

```bash
npm install
```

### 2. Konfigurer environment variables

Kopier `.env.example` til `.env` og fyll inn verdiene:

```bash
cp .env.example .env
```

Rediger `.env`:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/nais_audit
GITHUB_TOKEN=your_github_personal_access_token
NAIS_GRAPHQL_URL=http://localhost:4242/graphql
```

#### GitHub Token
1. Gå til GitHub Settings → Developer settings → Personal access tokens
2. Generer et nytt token med `repo` scope
3. Lim inn tokenet i `.env`

#### Nais GraphQL API
For lokal utvikling: Bruk port-forwarding eller Naisdevice for å nå Nais API.

### 3. Initialiser database med V2 schema

```bash
npm run db:init-v2
```

Dette vil:
- Droppe eksisterende tabeller (hvis noen)
- Opprette nye V2-tabeller
- Vise oversikt over opprettede tabeller

### 4. Start utviklingsserver

```bash
npm run dev
```

Åpne [http://localhost:5173](http://localhost:5173)

## 📖 Bruk

### 1. Oppdag og legg til applikasjoner

1. Gå til "Oppdag applikasjoner"
2. Skriv inn team slug (f.eks. `pensjon-q2`)
3. Velg hvilke applikasjoner som skal overvåkes
4. Legg til valgte applikasjoner

### 2. Synkroniser deployments

Fra "Overvåkede applikasjoner":
- Klikk "Synk" for å hente deployments for en applikasjon
- Appen henter automatisk alle deployments fra Nais
- Four-eyes status verifiseres mot GitHub

### 3. Håndter repository-varsler

Fra "Varsler":
- Se alle uløste repository-mismatch varsler
- Verifiser at endringen er legitim
- Marker som løst med en merknad

### 4. Se deployments

Fra "Deployments":
- Filtrer på team, applikasjon, miljø, tidsperiode
- Se four-eyes status for hver deployment
- ⚠️ markering viser repository-mismatch

## 🧪 Testing

### Test API-klienten

```bash
# Test discovery av applikasjoner
npm run test:v2-discovery -- pensjon-q2

# Test henting av deployments
npm run test:v2-fetch -- pensjon-q2 dev-fss pensjon-pen-q2
```

### Type-sjekking

```bash
npm run typecheck
```

### Linting og formatering

```bash
npm run lint
npm run lint:fix
npm run format
```

## 📁 Prosjektstruktur

```
app/
├── db/
│   ├── schema_v2.sql              # V2 database schema
│   ├── monitored-applications.ts  # CRUD for overvåkede apps
│   ├── deployments.ts             # Deployment operations
│   ├── alerts.ts                  # Repository alert management
│   └── comments.ts                # Deployment comments
├── lib/
│   ├── nais-v2.ts                 # Nais GraphQL client (V2)
│   ├── sync-v2.ts                 # Deployment sync logic (V2)
│   └── github.ts                  # GitHub API client
├── routes/
│   ├── home.tsx                   # Dashboard
│   ├── apps/                      # Application management
│   ├── deployments/               # Deployment views
│   ├── alerts.tsx                 # Security alerts
│   └── tertial-boards/            # Tertialmål
└── root.tsx
```

## 🔄 Migrering fra V1

Hvis du kjører V1 og vil oppgradere:

```bash
# Backup eksisterende data først!
pg_dump nais_audit > backup.sql

# Kjør V2 init (dropper og oppretter nye tabeller)
npm run db:init-v2
```

**Merk**: V1 og V2 er inkompatible. V2 starter med blanke tabeller.

## 📚 Database Schema V2

### `monitored_applications`
Primær entitet - representerer en applikasjon i et miljø for et team.

### `deployments`
Knyttet til `monitored_applications`, inneholder detektert repository.

### `repository_alerts`
Opprett automatisk når detected repository ≠ approved repository.

### `deployment_comments`
Kommentarer og Slack-lenker for deployments.

### `tertial_boards` og `tertial_goals`
Uendret fra V1 - fungerer med nye deployments.

## 🤝 Bidrag

Dette er et internt Nav-verktøy. Bidrag er velkomne!

## 📝 Lisens

Internt Nav-verktøy.
