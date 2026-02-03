import { CogIcon } from '@navikt/aksel-icons'
import { BodyShort, Box, Button, Detail, Heading, HStack, Label, Select, TextField, VStack } from '@navikt/ds-react'
import { type ActionFunctionArgs, Form, type LoaderFunctionArgs, useActionData, useLoaderData } from 'react-router'
import {
  getAppConfigAuditLog,
  getImplicitApprovalSettings,
  updateImplicitApprovalSettings,
} from '~/db/app-settings.server'
import { getMonitoredApplicationByIdentity, updateMonitoredApplication } from '~/db/monitored-applications.server'
import { getUserIdentity } from '~/lib/auth.server'

export function meta({ data }: { data: Awaited<ReturnType<typeof loader>> | undefined }) {
  return [{ title: data?.app ? `Admin - ${data.app.app_name}` : 'Admin' }]
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { team, env, app: appName } = params
  if (!team || !env || !appName) {
    throw new Response('Missing route parameters', { status: 400 })
  }

  const app = await getMonitoredApplicationByIdentity(team, env, appName)
  if (!app) {
    throw new Response('Application not found', { status: 404 })
  }

  const [implicitApprovalSettings, recentConfigChanges] = await Promise.all([
    getImplicitApprovalSettings(app.id),
    getAppConfigAuditLog(app.id, { limit: 10 }),
  ])

  return {
    app,
    implicitApprovalSettings,
    recentConfigChanges,
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const action = formData.get('action') as string
  const appId = parseInt(formData.get('app_id') as string, 10)

  const identity = getUserIdentity(request)
  if (!identity?.navIdent) {
    return { error: 'Du må være logget inn for å endre innstillinger' }
  }

  if (action === 'update_default_branch') {
    const defaultBranch = formData.get('default_branch') as string
    if (!defaultBranch || defaultBranch.trim() === '') {
      return { error: 'Default branch kan ikke være tom' }
    }
    await updateMonitoredApplication(appId, { default_branch: defaultBranch.trim() })
    return { success: 'Default branch oppdatert!' }
  }

  if (action === 'update_implicit_approval') {
    const mode = formData.get('mode') as 'off' | 'dependabot_only' | 'all'
    if (!['off', 'dependabot_only', 'all'].includes(mode)) {
      return { error: 'Ugyldig modus' }
    }

    await updateImplicitApprovalSettings({
      monitoredAppId: appId,
      settings: { mode },
      changedByNavIdent: identity.navIdent,
      changedByName: identity.name || undefined,
    })
    return { success: 'Implisitt godkjenning-innstillinger oppdatert!' }
  }

  if (action === 'update_audit_start_year') {
    const appIdForYear = parseInt(formData.get('app_id') as string, 10)
    const startYearValue = formData.get('audit_start_year') as string

    let auditStartYear: number | null = null
    if (startYearValue && startYearValue.trim() !== '') {
      auditStartYear = parseInt(startYearValue, 10)
      if (Number.isNaN(auditStartYear) || auditStartYear < 2000 || auditStartYear > 2100) {
        return { error: 'Ugyldig startår. Må være mellom 2000 og 2100.' }
      }
    }

    await updateMonitoredApplication(appIdForYear, { audit_start_year: auditStartYear })
    return { success: 'Startår for revisjon oppdatert!' }
  }

  return null
}

export default function AppAdmin() {
  const { app, implicitApprovalSettings, recentConfigChanges } = useLoaderData<typeof loader>()
  const actionData = useActionData<typeof action>()

  return (
    <VStack gap="space-32">
      {/* Header */}
      <HStack gap="space-12" align="center">
        <CogIcon aria-hidden fontSize="1.5rem" />
        <Heading size="large">Innstillinger for {app.app_name}</Heading>
      </HStack>

      {/* Success/Error messages */}
      {actionData?.success && (
        <Box padding="space-16" borderRadius="8" background="success-softA">
          <BodyShort>{actionData.success}</BodyShort>
        </Box>
      )}
      {actionData?.error && (
        <Box padding="space-16" borderRadius="8" background="danger-softA">
          <BodyShort>{actionData.error}</BodyShort>
        </Box>
      )}

      {/* Default Branch */}
      <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
        <VStack gap="space-16">
          <Heading size="small">Default branch</Heading>
          <Form method="post">
            <input type="hidden" name="action" value="update_default_branch" />
            <input type="hidden" name="app_id" value={app.id} />
            <HStack gap="space-16" align="end" wrap>
              <TextField
                label="Branch"
                description="Branchen som PR-er må gå til for å bli godkjent (f.eks. main, master)"
                name="default_branch"
                defaultValue={app.default_branch}
                size="small"
                style={{ minWidth: '200px' }}
              />
              <Button type="submit" size="small" variant="secondary">
                Lagre
              </Button>
            </HStack>
          </Form>
        </VStack>
      </Box>

      {/* Audit Start Year */}
      <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
        <VStack gap="space-16">
          <Heading size="small">Startår for revisjon</Heading>
          <Form method="post">
            <input type="hidden" name="action" value="update_audit_start_year" />
            <input type="hidden" name="app_id" value={app.id} />
            <HStack gap="space-16" align="end" wrap>
              <TextField
                label="År"
                description="Deployments før dette året ignoreres i statistikk og rapporter"
                name="audit_start_year"
                type="number"
                defaultValue={app.audit_start_year ?? ''}
                size="small"
                style={{ minWidth: '120px' }}
              />
              <Button type="submit" size="small" variant="secondary">
                Lagre
              </Button>
            </HStack>
          </Form>
        </VStack>
      </Box>

      {/* Implicit Approval Settings */}
      <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
        <VStack gap="space-16">
          <div>
            <Heading size="small">Implisitt godkjenning</Heading>
            <BodyShort textColor="subtle" size="small">
              Godkjenner automatisk en PR hvis den som merger ikke er PR-oppretteren og ikke har siste commit.
            </BodyShort>
          </div>

          <Form method="post">
            <input type="hidden" name="action" value="update_implicit_approval" />
            <input type="hidden" name="app_id" value={app.id} />
            <VStack gap="space-12">
              <Select
                label="Modus"
                name="mode"
                defaultValue={implicitApprovalSettings.mode}
                size="small"
                style={{ maxWidth: '300px' }}
              >
                <option value="off">Av</option>
                <option value="dependabot_only">Kun Dependabot</option>
                <option value="all">Alle</option>
              </Select>

              <BodyShort size="small" textColor="subtle">
                <strong>Kun Dependabot:</strong> Godkjenner automatisk PRer opprettet av Dependabot med kun
                Dependabot-commits.
                <br />
                <strong>Alle:</strong> Godkjenner alle PRer der den som merger verken opprettet PRen eller har siste
                commit.
              </BodyShort>

              <Button type="submit" size="small" variant="secondary">
                Lagre innstillinger
              </Button>
            </VStack>
          </Form>
        </VStack>
      </Box>

      {/* Recent config changes */}
      {recentConfigChanges.length > 0 && (
        <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
          <VStack gap="space-16">
            <Label>Siste endringer</Label>
            <VStack gap="space-4">
              {recentConfigChanges.map((change) => (
                <Detail key={change.id} textColor="subtle">
                  {new Date(change.created_at).toLocaleString('no-NO')} -{' '}
                  {change.changed_by_name || change.changed_by_nav_ident}: {change.setting_key}
                </Detail>
              ))}
            </VStack>
          </VStack>
        </Box>
      )}
    </VStack>
  )
}
