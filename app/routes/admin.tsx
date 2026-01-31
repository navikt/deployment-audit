import { ArrowsCirclepathIcon, CogIcon, PersonGroupIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Heading, HGrid, VStack } from '@navikt/ds-react'
import { Link } from 'react-router'
import type { Route } from './+types/admin'

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Admin - Pensjon Deployment Audit' }]
}

export default function AdminIndex() {
  return (
    <VStack gap="space-24">
      <div>
        <Heading size="large" spacing>
          Administrasjon
        </Heading>
        <BodyShort textColor="subtle">Administrer brukere, synkronisering og systeminnstillinger.</BodyShort>
      </div>

      <HGrid gap="space-16" columns={{ xs: 1, md: 2, lg: 3 }}>
        <Link to="/admin/users" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <PersonGroupIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading size="small" spacing>
                  Brukermappinger
                </Heading>
                <BodyShort textColor="subtle">
                  Koble GitHub-brukernavn til NAV-identiteter for bedre sporbarhet.
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Link to="/admin/sync-jobs" style={{ textDecoration: 'none' }}>
          <Box
            padding="space-24"
            borderRadius="8"
            background="raised"
            borderColor="neutral-subtle"
            borderWidth="1"
            className="admin-card"
          >
            <VStack gap="space-12">
              <ArrowsCirclepathIcon fontSize="2rem" aria-hidden />
              <div>
                <Heading size="small" spacing>
                  Sync Jobs
                </Heading>
                <BodyShort textColor="subtle">
                  Overvåk synkroniseringsjobber og distribuert låsing mellom podder.
                </BodyShort>
              </div>
            </VStack>
          </Box>
        </Link>

        <Box
          padding="space-24"
          borderRadius="8"
          background="sunken"
          borderColor="neutral-subtle"
          borderWidth="1"
          style={{ opacity: 0.6 }}
        >
          <VStack gap="space-12">
            <CogIcon fontSize="2rem" aria-hidden />
            <div>
              <Heading size="small" spacing>
                Innstillinger
              </Heading>
              <BodyShort textColor="subtle">Systeminnstillinger (kommer snart).</BodyShort>
            </div>
          </VStack>
        </Box>
      </HGrid>
    </VStack>
  )
}
