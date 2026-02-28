/**
 * Environment Variables Admin Page
 *
 * Shows all environment variable names available to the application.
 * Values are intentionally hidden for security.
 */

import { BodyShort, Box, Heading, Search, Table, Tag, VStack } from '@navikt/ds-react'
import { useState } from 'react'
import { useLoaderData } from 'react-router'
import { requireAdmin } from '~/lib/auth.server'
import type { Route } from './+types/admin.environment'

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Miljøvariabler - Admin' }]
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request)

  const envVars = Object.keys(process.env)
    .sort()
    .map((name) => {
      const value = process.env[name] ?? ''
      return {
        name,
        hasValue: value.length > 0,
      }
    })

  return { envVars, total: envVars.length }
}

export default function EnvVarsPage() {
  const { envVars, total } = useLoaderData<typeof loader>()
  const [filter, setFilter] = useState('')

  const filtered = filter ? envVars.filter((v) => v.name.toLowerCase().includes(filter.toLowerCase())) : envVars

  return (
    <Box paddingBlock="space-8" paddingInline={{ xs: 'space-4', md: 'space-8' }}>
      <VStack gap="space-24">
        <div>
          <Heading level="1" size="large" spacing>
            Miljøvariabler
          </Heading>
          <BodyShort textColor="subtle">
            Viser navn på alle {total} miljøvariabler tilgjengelig for appen. Verdier er skjult av sikkerhetshensyn.
          </BodyShort>
        </div>

        <Search
          label="Filtrer miljøvariabler"
          hideLabel
          placeholder="Søk etter variabelnavn..."
          value={filter}
          onChange={setFilter}
          onClear={() => setFilter('')}
          style={{ maxWidth: '400px' }}
        />

        <Table size="small">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Navn</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((v) => (
              <Table.Row key={v.name}>
                <Table.DataCell>
                  <code style={{ fontSize: '0.875rem' }}>{v.name}</code>
                </Table.DataCell>
                <Table.DataCell>
                  {v.hasValue ? (
                    <Tag variant="success" size="small">
                      Satt
                    </Tag>
                  ) : (
                    <Tag variant="warning" size="small">
                      Tom
                    </Tag>
                  )}
                </Table.DataCell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>

        {filtered.length === 0 && <BodyShort textColor="subtle">Ingen variabler matcher «{filter}».</BodyShort>}
      </VStack>
    </Box>
  )
}
