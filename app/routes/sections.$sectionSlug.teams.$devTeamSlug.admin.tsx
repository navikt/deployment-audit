import { PlusIcon, TrashIcon } from '@navikt/aksel-icons'
import {
  Alert,
  BodyShort,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  Heading,
  HStack,
  Modal,
  Table,
  Tag,
  TextField,
  UNSAFE_Combobox,
  VStack,
} from '@navikt/ds-react'
import { useRef, useState } from 'react'
import { Form, useLoaderData } from 'react-router'
import { ActionAlert } from '~/components/ActionAlert'
import {
  addNaisTeamToDevTeam,
  type DevTeamApplication,
  getAvailableAppsForDevTeam,
  getDevTeamApplications,
  getDevTeamBySlug,
  removeAppFromDevTeam,
  removeNaisTeamFromDevTeam,
  setDevTeamApplications,
  updateDevTeam,
} from '~/db/dev-teams.server'
import { getSectionBySlug } from '~/db/sections.server'
import {
  addUserDevTeam,
  type DevTeamMember,
  getDevTeamMembers,
  removeUserDevTeam,
} from '~/db/user-dev-team-preference.server'
import { getAllUserMappings, getUserMappingByNavIdent } from '~/db/user-mappings.server'
import { fail, ok } from '~/lib/action-result'
import { requireAdmin } from '~/lib/auth.server'
import { getFormString, isValidNavIdent } from '~/lib/form-validators'
import { parseAppIds } from '~/lib/parse-app-ids'
import type { Route } from './+types/sections.$sectionSlug.teams.$devTeamSlug.admin'

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Admin – ${data?.devTeam?.name ?? 'Utviklingsteam'}` }]
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request)

  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) {
    throw new Response('Utviklingsteam ikke funnet', { status: 404 })
  }

  const section = await getSectionBySlug(params.sectionSlug)
  if (!section) {
    throw new Response('Seksjon ikke funnet', { status: 404 })
  }

  if (devTeam.section_slug !== section.slug) {
    throw new Response('Utviklingsteamet tilhører ikke denne seksjonen', { status: 404 })
  }

  const [members, linkedApps, availableApps, allUsers] = await Promise.all([
    getDevTeamMembers(devTeam.id),
    getDevTeamApplications(devTeam.id),
    getAvailableAppsForDevTeam(devTeam.id),
    getAllUserMappings(),
  ])

  return {
    devTeam,
    members,
    linkedApps,
    availableApps,
    sectionName: section.name,
    allUsers: allUsers
      .filter((u) => u.nav_ident)
      .map((u) => ({ navIdent: u.nav_ident!, displayName: u.display_name, githubUsername: u.github_username })),
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAdmin(request)

  const devTeam = await getDevTeamBySlug(params.devTeamSlug)
  if (!devTeam) {
    throw new Response('Utviklingsteam ikke funnet', { status: 404 })
  }

  if (devTeam.section_slug !== params.sectionSlug) {
    throw new Response('Utviklingsteamet tilhører ikke denne seksjonen', { status: 404 })
  }

  const formData = await request.formData()
  const intent = getFormString(formData, 'intent')

  if (intent === 'add_member') {
    const navIdent = getFormString(formData, 'nav_ident')
    if (!navIdent) {
      return fail('NAV-ident er påkrevd.')
    }
    if (!isValidNavIdent(navIdent)) {
      return fail('Ugyldig NAV-ident. Forventet format: én bokstav etterfulgt av 6 siffer (f.eks. A123456).')
    }
    const userMapping = await getUserMappingByNavIdent(navIdent)
    if (!userMapping) {
      return fail(
        `Brukeren ${navIdent.toUpperCase()} er ikke kjent i systemet. Opprett en brukerkobling først under Admin → Brukermappinger.`,
      )
    }
    try {
      await addUserDevTeam(navIdent.toUpperCase(), devTeam.id)
      return ok(`${userMapping.display_name ?? navIdent.toUpperCase()} ble lagt til som medlem.`)
    } catch {
      return fail('Kunne ikke legge til medlem.')
    }
  }

  if (intent === 'remove_member') {
    const navIdent = getFormString(formData, 'nav_ident')
    if (!navIdent) {
      return fail('NAV-ident er påkrevd.')
    }
    try {
      await removeUserDevTeam(navIdent.toUpperCase(), devTeam.id)
      return ok(`${navIdent.toUpperCase()} ble fjernet fra teamet.`)
    } catch {
      return fail('Kunne ikke fjerne medlem.')
    }
  }

  if (intent === 'update_name') {
    const name = getFormString(formData, 'name')
    if (!name) {
      return fail('Teamnavn er påkrevd.')
    }
    try {
      await updateDevTeam(devTeam.id, { name })
      return ok('Teamnavn ble oppdatert.')
    } catch {
      return fail('Kunne ikke oppdatere teamnavn.')
    }
  }

  if (intent === 'add_nais_team') {
    const slug = getFormString(formData, 'slug')?.trim()
    if (!slug) {
      return fail('Nais-team slug er påkrevd.')
    }
    try {
      await addNaisTeamToDevTeam(devTeam.id, slug)
      return ok(`Nais-team "${slug}" ble lagt til.`)
    } catch {
      return fail('Kunne ikke legge til Nais-team.')
    }
  }

  if (intent === 'update_apps') {
    const appIds = parseAppIds(formData.getAll('app_ids'))
    if (!appIds) {
      return fail('Ugyldige applikasjons-ID-er.')
    }
    try {
      await setDevTeamApplications(devTeam.id, appIds, user.navIdent)
      return ok(`Applikasjoner ble oppdatert (${appIds.length} valgt).`)
    } catch {
      return fail('Kunne ikke oppdatere applikasjoner.')
    }
  }

  if (intent === 'remove_nais_team') {
    const slug = getFormString(formData, 'slug')
    if (!slug) {
      return fail('Nais-team slug er påkrevd.')
    }
    try {
      await removeNaisTeamFromDevTeam(devTeam.id, slug, user.navIdent)
      return ok(`Nais-team "${slug}" ble fjernet.`)
    } catch {
      return fail('Kunne ikke fjerne Nais-team.')
    }
  }

  if (intent === 'remove_app') {
    const appId = Number(getFormString(formData, 'app_id'))
    if (!Number.isInteger(appId) || appId <= 0) {
      return fail('Ugyldig applikasjons-ID.')
    }
    try {
      await removeAppFromDevTeam(devTeam.id, appId, user.navIdent)
      return ok('Applikasjon ble fjernet.')
    } catch {
      return fail('Kunne ikke fjerne applikasjon.')
    }
  }

  return fail('Ukjent handling.')
}

export default function DevTeamAdmin({ actionData }: Route.ComponentProps) {
  const { devTeam, members, linkedApps, availableApps, allUsers } = useLoaderData<typeof loader>()

  return (
    <VStack gap="space-24">
      <div>
        <Heading level="1" size="large" spacing>
          Administrer {devTeam.name}
        </Heading>
        <BodyShort textColor="subtle">Administrer medlemmer, applikasjoner og Nais-team.</BodyShort>
      </div>

      <ActionAlert data={actionData} />

      <TeamNameSection name={devTeam.name} />
      <MembersSection members={members} allUsers={allUsers} />
      <NaisTeamsSection naisTeamSlugs={devTeam.nais_team_slugs} />
      <ApplicationsSection linkedApps={linkedApps} availableApps={availableApps} />
    </VStack>
  )
}

function TeamNameSection({ name }: { name: string }) {
  const [editing, setEditing] = useState(false)

  return (
    <VStack gap="space-16">
      <Heading level="2" size="medium">
        Teamnavn
      </Heading>
      {editing ? (
        <Box padding="space-24" borderRadius="8" background="raised" borderColor="neutral-subtle" borderWidth="1">
          <Form method="post" onSubmit={() => setEditing(false)}>
            <input type="hidden" name="intent" value="update_name" />
            <VStack gap="space-12">
              <TextField label="Teamnavn" name="name" size="small" defaultValue={name} autoComplete="off" />
              <HStack gap="space-8">
                <Button type="submit" size="small">
                  Lagre
                </Button>
                <Button variant="tertiary" size="small" onClick={() => setEditing(false)}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Box>
      ) : (
        <HStack gap="space-12" align="center">
          <Tag variant="neutral">{name}</Tag>
          <Button variant="tertiary" size="small" onClick={() => setEditing(true)}>
            Endre
          </Button>
        </HStack>
      )}
    </VStack>
  )
}

interface UserOption {
  navIdent: string
  displayName: string | null
  githubUsername: string
}

function MembersSection({ members, allUsers }: { members: DevTeamMember[]; allUsers: UserOption[] }) {
  const modalRef = useRef<HTMLDialogElement>(null)
  const [selectedNavIdent, setSelectedNavIdent] = useState('')

  const memberIdents = new Set(members.map((m) => m.nav_ident.toUpperCase()))
  const availableUsers = allUsers.filter((u) => !memberIdents.has(u.navIdent.toUpperCase()))

  const comboboxOptions = availableUsers.map((u) => ({
    label: `${u.displayName ?? u.githubUsername} (${u.navIdent})`,
    value: u.navIdent,
  }))

  return (
    <VStack gap="space-16">
      <HStack justify="space-between" align="center">
        <Heading level="2" size="medium">
          Medlemmer ({members.length})
        </Heading>
        <Button
          variant="tertiary"
          size="small"
          icon={<PlusIcon aria-hidden />}
          onClick={() => modalRef.current?.showModal()}
        >
          Legg til medlem
        </Button>
      </HStack>

      {members.length > 0 ? (
        <Table size="small">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>NAV-ident</Table.HeaderCell>
              <Table.HeaderCell>Navn</Table.HeaderCell>
              <Table.HeaderCell>GitHub</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {members.map((member) => (
              <Table.Row key={member.nav_ident}>
                <Table.DataCell>
                  <code>{member.nav_ident}</code>
                </Table.DataCell>
                <Table.DataCell>{member.display_name ?? '–'}</Table.DataCell>
                <Table.DataCell>
                  {member.github_username ? (
                    <code>{member.github_username}</code>
                  ) : (
                    <BodyShort textColor="subtle">–</BodyShort>
                  )}
                </Table.DataCell>
                <Table.DataCell>
                  <Form method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="intent" value="remove_member" />
                    <input type="hidden" name="nav_ident" value={member.nav_ident} />
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />} type="submit">
                      Fjern
                    </Button>
                  </Form>
                </Table.DataCell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        <Alert variant="info" size="small">
          Ingen medlemmer er lagt til ennå.
        </Alert>
      )}

      <Modal ref={modalRef} header={{ heading: 'Legg til medlem' }} closeOnBackdropClick>
        <Modal.Body>
          <Form
            method="post"
            onSubmit={() => {
              modalRef.current?.close()
              setSelectedNavIdent('')
            }}
          >
            <input type="hidden" name="intent" value="add_member" />
            <input type="hidden" name="nav_ident" value={selectedNavIdent} />
            <VStack gap="space-16">
              <UNSAFE_Combobox
                label="Søk etter bruker"
                options={comboboxOptions}
                onToggleSelected={(value, isSelected) => {
                  setSelectedNavIdent(isSelected ? value : '')
                }}
                shouldAutocomplete
              />
              <HStack gap="space-8">
                <Button type="submit" size="small" icon={<PlusIcon aria-hidden />} disabled={!selectedNavIdent}>
                  Legg til
                </Button>
                <Button
                  variant="tertiary"
                  size="small"
                  type="button"
                  onClick={() => {
                    modalRef.current?.close()
                    setSelectedNavIdent('')
                  }}
                >
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Modal.Body>
      </Modal>
    </VStack>
  )
}

function NaisTeamsSection({ naisTeamSlugs }: { naisTeamSlugs: string[] }) {
  const modalRef = useRef<HTMLDialogElement>(null)
  const [newSlug, setNewSlug] = useState('')

  return (
    <VStack gap="space-16">
      <HStack justify="space-between" align="center">
        <Heading level="2" size="medium">
          Nais-team ({naisTeamSlugs.length})
        </Heading>
        <Button
          variant="tertiary"
          size="small"
          icon={<PlusIcon aria-hidden />}
          onClick={() => modalRef.current?.showModal()}
        >
          Legg til Nais-team
        </Button>
      </HStack>

      {naisTeamSlugs.length > 0 ? (
        <Table size="small">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Slug</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {naisTeamSlugs.map((slug) => (
              <Table.Row key={slug}>
                <Table.DataCell>
                  <code>{slug}</code>
                </Table.DataCell>
                <Table.DataCell>
                  <Form method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="intent" value="remove_nais_team" />
                    <input type="hidden" name="slug" value={slug} />
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />} type="submit">
                      Fjern
                    </Button>
                  </Form>
                </Table.DataCell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        <Alert variant="info" size="small">
          Ingen Nais-team er koblet til ennå.
        </Alert>
      )}

      <Modal ref={modalRef} header={{ heading: 'Legg til Nais-team' }} closeOnBackdropClick>
        <Modal.Body>
          <Form
            method="post"
            onSubmit={() => {
              modalRef.current?.close()
              setNewSlug('')
            }}
          >
            <input type="hidden" name="intent" value="add_nais_team" />
            <VStack gap="space-16">
              <TextField
                label="Nais-team slug"
                name="slug"
                size="small"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="F.eks. pensjondeployer"
                autoComplete="off"
              />
              <HStack gap="space-8">
                <Button type="submit" size="small" icon={<PlusIcon aria-hidden />} disabled={!newSlug.trim()}>
                  Legg til
                </Button>
                <Button
                  variant="tertiary"
                  size="small"
                  type="button"
                  onClick={() => {
                    modalRef.current?.close()
                    setNewSlug('')
                  }}
                >
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Modal.Body>
      </Modal>
    </VStack>
  )
}

function ApplicationsSection({
  linkedApps,
  availableApps,
}: {
  linkedApps: DevTeamApplication[]
  availableApps: { id: number; team_slug: string; environment_name: string; app_name: string; is_linked: boolean }[]
}) {
  const modalRef = useRef<HTMLDialogElement>(null)

  const appsByNaisTeam = new Map<string, typeof availableApps>()
  for (const app of availableApps) {
    const group = appsByNaisTeam.get(app.team_slug) ?? []
    group.push(app)
    appsByNaisTeam.set(app.team_slug, group)
  }

  return (
    <VStack gap="space-16">
      <HStack justify="space-between" align="center">
        <Heading level="2" size="medium">
          Applikasjoner ({linkedApps.length})
        </Heading>
        <Button
          variant="tertiary"
          size="small"
          icon={<PlusIcon aria-hidden />}
          onClick={() => modalRef.current?.showModal()}
        >
          Rediger applikasjoner
        </Button>
      </HStack>

      {linkedApps.length > 0 ? (
        <Table size="small">
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Applikasjon</Table.HeaderCell>
              <Table.HeaderCell>Miljø</Table.HeaderCell>
              <Table.HeaderCell>Nais-team</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {linkedApps.map((app) => (
              <Table.Row key={app.monitored_app_id}>
                <Table.DataCell>
                  <code>{app.app_name}</code>
                </Table.DataCell>
                <Table.DataCell>{app.environment_name}</Table.DataCell>
                <Table.DataCell>{app.team_slug}</Table.DataCell>
                <Table.DataCell>
                  <Form method="post" style={{ display: 'inline' }}>
                    <input type="hidden" name="intent" value="remove_app" />
                    <input type="hidden" name="app_id" value={app.monitored_app_id} />
                    <Button variant="tertiary-neutral" size="xsmall" icon={<TrashIcon aria-hidden />} type="submit">
                      Fjern
                    </Button>
                  </Form>
                </Table.DataCell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        <Alert variant="info" size="small">
          Ingen applikasjoner er direkte lenket. Applikasjoner kan også arves via Nais-team.
        </Alert>
      )}

      <Modal ref={modalRef} header={{ heading: 'Rediger applikasjoner' }} closeOnBackdropClick>
        <Modal.Body>
          <Form
            method="post"
            onSubmit={() => {
              modalRef.current?.close()
            }}
          >
            <input type="hidden" name="intent" value="update_apps" />
            <VStack gap="space-16">
              {availableApps.length === 0 ? (
                <Alert variant="info" size="small">
                  Ingen overvåkede applikasjoner funnet.
                </Alert>
              ) : (
                <VStack gap="space-16">
                  {[...appsByNaisTeam.entries()].map(([naisTeam, apps]) => (
                    <CheckboxGroup key={naisTeam} legend={naisTeam} size="small">
                      {apps.map((app) => (
                        <Checkbox key={app.id} name="app_ids" value={String(app.id)} defaultChecked={app.is_linked}>
                          {app.app_name}{' '}
                          <BodyShort as="span" size="small" textColor="subtle">
                            ({app.environment_name})
                          </BodyShort>
                        </Checkbox>
                      ))}
                    </CheckboxGroup>
                  ))}
                </VStack>
              )}
              <HStack gap="space-8">
                <Button type="submit" size="small">
                  Lagre
                </Button>
                <Button variant="tertiary" size="small" type="button" onClick={() => modalRef.current?.close()}>
                  Avbryt
                </Button>
              </HStack>
            </VStack>
          </Form>
        </Modal.Body>
      </Modal>
    </VStack>
  )
}
