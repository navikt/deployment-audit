# Pensjon Deployment Audit

En applikasjon for å overvåke deployments på Nav sin Nais-plattform og verifisere at alle har hatt "to sett av øyne" (four-eyes principle).

## ✨ Funksjoner

- 🔍 **Application Discovery**: Søk etter Nais teams og finn tilgjengelige applikasjoner
- 📦 **Deployment Tracking**: Automatisk synkronisering av deployments fra Nais
- ✅ **Four-Eyes Verification**: Automatisk sjekk av PR-godkjenninger
- 🚨 **Repository Alerts**: Varsler hvis deployment kommer fra uventet repository (sikkerhet!)
- 💬 **Kommentarer**: Legg til Slack-lenker for direct pushes
- 🎯 **Tertialtavler**: Koble deployments til tertialmål (tight-loose-tight)
- 📈 **Statistikk**: Oversikt over deployment-status

## 🏗️ Arkitektur

Appen bruker en applikasjon-sentrisk tilnærming hvor Team + Environment + Application er primær entitet. Hver applikasjon har et forventet repository (approved) og et detektert repository (faktisk). Hvis disse ikke matcher, opprettes automatisk et sikkerhetsfvarsel.

## Teknisk Stack

- **Framework**: React Router 7 med SSR
- **TypeScript**: For type-sikkerhet
- **Database**: PostgreSQL
- **UI**: Nav Aksel designsystem v8
- **APIs**: Nais GraphQL API og GitHub REST API

## 🚀 Oppsett

### 1. Installer dependencies

```bash
npm install
```

### 2. Konfigurer environment

Kopier `.env.example` til `.env`:

```bash
cp .env.example .env
```

Fyll inn:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/nais_audit
GITHUB_TOKEN=your_github_token
NAIS_GRAPHQL_URL=http://localhost:4242/graphql
```

### 3. Initialiser database

```bash
npm run db:init
```

### 4. Start appen

```bash
npm run dev
```

Åpne [http://localhost:5173](http://localhost:5173)

## 📖 Bruk

1. **Oppdag applikasjoner**: Søk etter team og velg hvilke apps som skal overvåkes
2. **Synkroniser**: Hent deployments automatisk fra Nais
3. **Verifiser**: Se four-eyes status for hver deployment
4. **Håndter varsler**: Løs repository-mismatch varsler

## 🧪 Testing

```bash
# Test API
npm run test:nais-discovery -- pensjon-q2
npm run test:nais-fetch -- pensjon-q2 dev-fss pensjon-pen-q2

# Type-sjekk
npm run typecheck

# Lint
npm run lint
```

## 📚 Database Schema

- **monitored_applications**: Overvåkede apps (team + env + app)
- **deployments**: Deployment-info med four-eyes status
- **repository_alerts**: Sikkerhetsvarsler ved repo-mismatch
- **deployment_comments**: Kommentarer og Slack-lenker
- **tertial_boards/goals**: Tertialmål

## 🤝 Bidrag

Internt Nav-verktøy. Bidrag velkomne!
