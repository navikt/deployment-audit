import { CheckmarkIcon } from '@navikt/aksel-icons'
import {
  Alert,
  BodyShort,
  Box,
  Button,
  Detail,
  Heading,
  Hide,
  HStack,
  Modal,
  Show,
  Tag,
  Textarea,
  VStack,
} from '@navikt/ds-react'
import { useState } from 'react'
import { Form, Link } from 'react-router'
import { getUnresolvedAlertsWithContext, resolveRepositoryAlert } from '../db/alerts.server'
import type { Route } from './+types/alerts'

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Repository-varsler - Pensjon Deployment Audit' }]
}

export async function loader() {
  const alerts = await getUnresolvedAlertsWithContext()
  return { alerts }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData()
  const intent = formData.get('intent')

  if (intent === 'resolve') {
    const alertId = Number(formData.get('alert_id'))
    const resolutionNote = formData.get('resolution_note') as string

    if (!resolutionNote?.trim()) {
      return {
        success: null,
        error: 'Vennligst skriv en merknad om hvordan varselet ble løst',
      }
    }

    try {
      await resolveRepositoryAlert(alertId, resolutionNote)
      return {
        success: 'Varsel markert som løst',
        error: null,
      }
    } catch (error) {
      console.error('Resolve error:', error)
      return {
        success: null,
        error: error instanceof Error ? error.message : 'Kunne ikke løse varsel',
      }
    }
  }

  return { success: null, error: 'Ugyldig handling' }
}

function getAlertTypeTag(alertType: string) {
  switch (alertType) {
    case 'repository_mismatch':
      return (
        <Tag data-color="danger" variant="outline" size="small">
          Ukjent repo
        </Tag>
      )
    case 'pending_approval':
      return (
        <Tag data-color="warning" variant="outline" size="small">
          Venter godkjenning
        </Tag>
      )
    case 'historical_repository':
      return (
        <Tag data-color="info" variant="outline" size="small">
          Historisk repo
        </Tag>
      )
    default:
      return (
        <Tag data-color="neutral" variant="outline" size="small">
          {alertType}
        </Tag>
      )
  }
}

export default function Alerts({ loaderData, actionData }: Route.ComponentProps) {
  const { alerts } = loaderData
  const [resolveModalOpen, setResolveModalOpen] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<(typeof alerts)[0] | null>(null)

  const openResolveModal = (alert: (typeof alerts)[0]) => {
    setSelectedAlert(alert)
    setResolveModalOpen(true)
  }

  return (
    <VStack gap="space-32">
      <div>
        <Heading size="large" spacing>
          Repository-varsler 🔒
        </Heading>
        <BodyShort textColor="subtle">
          Disse varslene oppstår når en deployment kommer fra et annet repository enn forventet. Dette kan indikere at
          noen har «kapret» en applikasjon, og må sjekkes manuelt.
        </BodyShort>
      </div>

      {actionData?.success && (
        <Alert variant="success" closeButton>
          {actionData.success}
        </Alert>
      )}

      {actionData?.error && <Alert variant="error">{actionData.error}</Alert>}

      {alerts.length === 0 && (
        <Alert variant="success">
          Ingen uløste varsler! 🎉 Alle applikasjoner deployer fra forventede repositories.
        </Alert>
      )}

      {alerts.length > 0 && (
        <VStack gap="space-16">
          <Alert variant="error">
            Du har <strong>{alerts.length} uløste varsel(er)</strong> som krever oppmerksomhet.
          </Alert>

          {alerts.map((alert) => (
            <Box
              key={alert.id}
              padding="space-20"
              borderRadius="8"
              background="raised"
              borderColor="danger-subtle"
              borderWidth="1"
            >
              <VStack gap="space-12">
                {/* First row: App name (desktop), type tag, timestamp */}
                <HStack gap="space-8" align="center" justify="space-between" wrap>
                  <HStack gap="space-12" align="center" style={{ flex: 1 }}>
                    <Show above="md">
                      <BodyShort weight="semibold">{alert.app_name}</BodyShort>
                      <Detail textColor="subtle">{alert.environment_name}</Detail>
                    </Show>
                    <Hide above="md">
                      <Detail textColor="subtle">
                        {new Date(alert.created_at).toLocaleDateString('nb-NO', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Detail>
                    </Hide>
                  </HStack>
                  <HStack gap="space-8" align="center">
                    {getAlertTypeTag(alert.alert_type)}
                    <Show above="md">
                      <Detail textColor="subtle">
                        {new Date(alert.created_at).toLocaleDateString('nb-NO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Detail>
                    </Show>
                  </HStack>
                </HStack>

                {/* App name on mobile */}
                <Hide above="md">
                  <HStack gap="space-8" align="center">
                    <BodyShort weight="semibold">{alert.app_name}</BodyShort>
                    <Detail textColor="subtle">{alert.environment_name}</Detail>
                  </HStack>
                </Hide>

                {/* Repository comparison */}
                <VStack gap="space-4">
                  <HStack gap="space-8" align="center" wrap>
                    <Detail textColor="subtle">Forventet:</Detail>
                    <Link
                      to={`https://github.com/${alert.expected_github_owner}/${alert.expected_github_repo_name}`}
                      target="_blank"
                      style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                    >
                      {alert.expected_github_owner}/{alert.expected_github_repo_name}
                    </Link>
                  </HStack>
                  <HStack gap="space-8" align="center" wrap>
                    <Detail textColor="subtle">Detektert:</Detail>
                    <Link
                      to={`https://github.com/${alert.detected_github_owner}/${alert.detected_github_repo_name}`}
                      target="_blank"
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        color: 'var(--ax-text-danger)',
                      }}
                    >
                      {alert.detected_github_owner}/{alert.detected_github_repo_name}
                    </Link>
                  </HStack>
                </VStack>

                {/* Team and action button */}
                <HStack gap="space-16" align="center" justify="space-between" wrap>
                  <Detail textColor="subtle">Team: {alert.team_slug}</Detail>
                  <Button
                    size="small"
                    variant="secondary"
                    icon={<CheckmarkIcon aria-hidden />}
                    onClick={() => openResolveModal(alert)}
                  >
                    Løs
                  </Button>
                </HStack>
              </VStack>
            </Box>
          ))}
        </VStack>
      )}

      <Modal
        open={resolveModalOpen}
        onClose={() => setResolveModalOpen(false)}
        header={{ heading: 'Løs repository-varsel' }}
      >
        <Modal.Body>
          {selectedAlert && (
            <VStack gap="space-16">
              <BodyShort>Du er i ferd med å markere dette varselet som løst:</BodyShort>
              <Alert variant="warning">
                <strong>{selectedAlert.app_name}</strong> ({selectedAlert.environment_name})
                <br />
                Forventet: {selectedAlert.expected_github_owner}/{selectedAlert.expected_github_repo_name}
                <br />
                Detektert: {selectedAlert.detected_github_owner}/{selectedAlert.detected_github_repo_name}
              </Alert>

              <Form method="post">
                <input type="hidden" name="intent" value="resolve" />
                <input type="hidden" name="alert_id" value={selectedAlert.id} />

                <Textarea
                  name="resolution_note"
                  label="Hvordan ble varselet løst?"
                  description="Forklar hva som ble gjort for å løse varselet (f.eks. 'Verifisert at repo-endring var legitim', 'Oppdatert godkjent repository')"
                  required
                  minLength={10}
                />

                <HStack gap="space-16" justify="end" marginBlock="space-16 space-0">
                  <Button type="button" variant="secondary" onClick={() => setResolveModalOpen(false)}>
                    Avbryt
                  </Button>
                  <Button type="submit" variant="primary">
                    Marker som løst
                  </Button>
                </HStack>
              </Form>
            </VStack>
          )}
        </Modal.Body>
      </Modal>
    </VStack>
  )
}
