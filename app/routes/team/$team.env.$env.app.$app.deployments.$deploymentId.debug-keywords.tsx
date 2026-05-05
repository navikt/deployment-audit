/**
 * Debug Goal Keyword Matching Page
 *
 * Shows why a deployment was/wasn't auto-linked to board goals via commit keywords.
 * Displays: extracted commit messages, loaded board keywords, match results, existing links.
 * Only available to admins.
 */

import { Alert, BodyShort, Box, Button, Heading, HStack, Tag, VStack } from '@navikt/ds-react'
import { Link } from 'react-router'
import { pool } from '~/db/connection.server'
import { getDeploymentById } from '~/db/deployments.server'
import { getUserIdentity } from '~/lib/auth.server'
import { type BoardKeywordSource, matchCommitKeywords } from '~/lib/goal-keyword-matcher'
import { extractCommitInfos } from '~/lib/sync/github-verify.server'
import type { Route } from './+types/$team.env.$env.app.$app.deployments.$deploymentId.debug-keywords'

export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await getUserIdentity(request)
  if (user?.role !== 'admin') {
    throw new Response('Admin access required', { status: 403 })
  }

  const deploymentId = Number.parseInt(params.deploymentId, 10)
  if (Number.isNaN(deploymentId)) {
    throw new Response('Invalid deployment ID', { status: 400 })
  }

  const deployment = await getDeploymentById(deploymentId)
  if (!deployment) {
    throw new Response('Deployment not found', { status: 404 })
  }

  // Extract commit messages (same logic as the sync job)
  const commitInfos = extractCommitInfos(deployment as Parameters<typeof extractCommitInfos>[0])

  // Find dev teams for this deployment (same query as autoLinkGoalKeywords)
  const devTeamResult = await pool.query(
    `SELECT dt.id, dt.name FROM dev_teams dt
     JOIN dev_team_nais_teams dtn ON dtn.dev_team_id = dt.id
     WHERE dtn.nais_team_slug = $1 AND dtn.deleted_at IS NULL AND dt.is_active = true
     UNION
     SELECT dt.id, dt.name FROM dev_teams dt
     JOIN dev_team_applications dta ON dta.dev_team_id = dt.id
     WHERE dta.monitored_app_id = $2 AND dta.deleted_at IS NULL AND dt.is_active = true
     UNION
     SELECT dt.id, dt.name FROM dev_teams dt
     JOIN dev_team_application_groups dtag ON dtag.dev_team_id = dt.id
     JOIN monitored_applications ma ON ma.application_group_id = dtag.application_group_id
     WHERE ma.id = $2 AND dtag.deleted_at IS NULL AND dt.is_active = true`,
    [deployment.team_slug, deployment.monitored_app_id],
  )

  const devTeams = devTeamResult.rows as Array<{ id: number; name: string }>
  const devTeamIds = devTeams.map((r) => r.id)

  // Load board keywords
  let boardKeywords: BoardKeywordSource[] = []
  let boardKeywordsRaw: Array<{
    board_id: number
    board_name: string
    period_start: string
    period_end: string
    objective_id: number
    objective_title: string
    key_result_id: number | null
    key_result_title: string | null
    keyword: string
  }> = []

  if (devTeamIds.length > 0) {
    const keywordsResult = await pool.query(
      `SELECT
         b.id AS board_id,
         b.name AS board_name,
         b.period_start,
         b.period_end,
         bo.id AS objective_id,
         bo.title AS objective_title,
         NULL::int AS key_result_id,
         NULL::text AS key_result_title,
         unnest(bo.keywords) AS keyword
       FROM boards b
       JOIN board_objectives bo ON bo.board_id = b.id
       WHERE b.dev_team_id = ANY($1) AND b.is_active = true AND bo.is_active = true AND array_length(bo.keywords, 1) > 0
       UNION ALL
       SELECT
         b.id AS board_id,
         b.name AS board_name,
         b.period_start,
         b.period_end,
         bo.id AS objective_id,
         bo.title AS objective_title,
         bkr.id AS key_result_id,
         bkr.title AS key_result_title,
         unnest(bkr.keywords) AS keyword
       FROM boards b
       JOIN board_objectives bo ON bo.board_id = b.id
       JOIN board_key_results bkr ON bkr.objective_id = bo.id
       WHERE b.dev_team_id = ANY($1) AND b.is_active = true AND bo.is_active = true AND bkr.is_active = true AND array_length(bkr.keywords, 1) > 0`,
      [devTeamIds],
    )

    boardKeywordsRaw = keywordsResult.rows
    boardKeywords = boardKeywordsRaw.map((r) => ({
      boardId: r.board_id,
      periodStart: new Date(r.period_start),
      periodEnd: new Date(r.period_end),
      objectiveId: r.objective_id,
      keyResultId: r.key_result_id,
      keyword: r.keyword,
    }))
  }

  // Run matching
  const matches = matchCommitKeywords(commitInfos, boardKeywords)

  // Load existing goal links for comparison
  const existingLinksResult = await pool.query(
    `SELECT dgl.objective_id, dgl.key_result_id, dgl.link_method,
            bo.title AS objective_title, bkr.title AS key_result_title
     FROM deployment_goal_links dgl
     LEFT JOIN board_objectives bo ON bo.id = dgl.objective_id
     LEFT JOIN board_key_results bkr ON bkr.id = dgl.key_result_id
     WHERE dgl.deployment_id = $1 AND dgl.is_active = true`,
    [deploymentId],
  )

  return {
    deployment: {
      id: deployment.id,
      title: deployment.title,
      team_slug: deployment.team_slug,
      environment_name: deployment.environment_name,
      app_name: deployment.app_name,
      created_at: deployment.created_at,
      commit_sha: deployment.commit_sha,
    },
    commitInfos: commitInfos.map((c) => ({ message: c.message, date: c.date.toISOString() })),
    devTeams,
    boardKeywords: boardKeywordsRaw.map((r) => ({
      boardId: r.board_id,
      boardName: r.board_name,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      objectiveId: r.objective_id,
      objectiveTitle: r.objective_title,
      keyResultId: r.key_result_id,
      keyResultTitle: r.key_result_title,
      keyword: r.keyword,
    })),
    matches: matches.map((m) => ({
      ...m,
      objectiveTitle: boardKeywordsRaw.find((bk) => bk.objective_id === m.objectiveId)?.objective_title ?? '',
      keyResultTitle: boardKeywordsRaw.find((bk) => bk.key_result_id === m.keyResultId)?.key_result_title ?? null,
    })),
    existingLinks: existingLinksResult.rows as Array<{
      objective_id: number
      key_result_id: number | null
      link_method: string
      objective_title: string | null
      key_result_title: string | null
    }>,
  }
}

export function meta() {
  return [{ title: 'Debug Nøkkelord-kobling' }]
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function DebugKeywordsPage({ loaderData }: Route.ComponentProps) {
  const { deployment, commitInfos, devTeams, boardKeywords, matches, existingLinks } = loaderData
  const appUrl = `/team/${deployment.team_slug}/env/${deployment.environment_name}/app/${deployment.app_name}`

  const handleExport = () => {
    const filename = `debug-keywords-${deployment.id}-${new Date().toISOString().slice(0, 10)}.json`
    downloadJson(loaderData, filename)
  }

  // Group keywords by board for display
  const keywordsByBoard = new Map<number, { boardName: string; keywords: typeof boardKeywords }>()
  for (const bk of boardKeywords) {
    const entry = keywordsByBoard.get(bk.boardId) ?? { boardName: bk.boardName, keywords: [] }
    entry.keywords.push(bk)
    keywordsByBoard.set(bk.boardId, entry)
  }

  // Detect ambiguous keywords (matched in multiple boards)
  const keywordBoardMap = new Map<string, Set<number>>()
  for (const bk of boardKeywords) {
    const lower = bk.keyword.toLowerCase()
    const set = keywordBoardMap.get(lower) ?? new Set()
    set.add(bk.boardId)
    keywordBoardMap.set(lower, set)
  }
  const ambiguousKeywords = new Set<string>()
  for (const [kw, boards] of keywordBoardMap) {
    if (boards.size > 1) ambiguousKeywords.add(kw)
  }

  return (
    <Box paddingBlock="space-8" paddingInline={{ xs: 'space-4', md: 'space-8' }}>
      <VStack gap="space-6">
        <HStack justify="space-between" align="center">
          <VStack gap="space-2">
            <Heading size="large" level="1">
              🔑 Debug Nøkkelord-kobling
            </Heading>
            <BodyShort>
              Deployment #{deployment.id} — {deployment.title ?? deployment.commit_sha?.substring(0, 7) ?? 'ukjent'}
            </BodyShort>
          </VStack>
          <HStack gap="space-4" align="center">
            <Button variant="secondary" size="small" onClick={handleExport}>
              📥 Eksporter JSON
            </Button>
            <Link to={`${appUrl}/deployments/${deployment.id}`}>
              <Button variant="secondary" size="small">
                ← Tilbake
              </Button>
            </Link>
          </HStack>
        </HStack>

        {/* Summary */}
        <Box background={matches.length > 0 ? 'success-soft' : 'warning-soft'} padding="space-4" borderRadius="8">
          <HStack gap="space-4" align="center">
            <Tag variant={matches.length > 0 ? 'success' : 'warning'}>
              {matches.length > 0 ? `${matches.length} treff` : 'Ingen treff'}
            </Tag>
            <BodyShort>
              {matches.length > 0
                ? `Fant ${matches.length} nøkkelord-kobling(er) basert på commit-meldinger`
                : 'Ingen nøkkelord i commit-meldinger matchet tavlens mål'}
            </BodyShort>
          </HStack>
        </Box>

        {/* Step 1: Dev teams found */}
        <Box background="neutral-soft" padding="space-4" borderRadius="8">
          <VStack gap="space-4">
            <Heading size="small" level="2">
              Steg 1: Finn utviklingsteam
            </Heading>
            {devTeams.length > 0 ? (
              <HStack gap="space-2">
                {devTeams.map((t) => (
                  <Tag key={t.id} variant="info">
                    {t.name}
                  </Tag>
                ))}
              </HStack>
            ) : (
              <Alert variant="error" size="small">
                Ingen utviklingsteam funnet for team_slug=&quot;{deployment.team_slug}&quot; / app_id=
                {deployment.id}
              </Alert>
            )}
          </VStack>
        </Box>

        {/* Step 2: Commit messages extracted */}
        <Box background="neutral-soft" padding="space-4" borderRadius="8">
          <VStack gap="space-4">
            <Heading size="small" level="2">
              Steg 2: Commit-meldinger ({commitInfos.length})
            </Heading>
            {commitInfos.length === 0 ? (
              <Alert variant="warning" size="small">
                Ingen commit-meldinger funnet (PR-tittel, unverified_commits, eller PR-commits)
              </Alert>
            ) : (
              <VStack gap="space-2">
                {commitInfos.map((c) => (
                  <Box key={`${c.date}-${c.message}`} padding="space-2" background="raised" borderRadius="4">
                    <VStack gap="space-1">
                      <BodyShort size="small" weight="semibold">
                        {c.message.split('\n')[0]}
                      </BodyShort>
                      <BodyShort size="small" textColor="subtle">
                        Dato: {new Date(c.date).toLocaleDateString('nb-NO')}
                      </BodyShort>
                    </VStack>
                  </Box>
                ))}
              </VStack>
            )}
          </VStack>
        </Box>

        {/* Step 3: Board keywords */}
        <Box background="neutral-soft" padding="space-4" borderRadius="8">
          <VStack gap="space-4">
            <Heading size="small" level="2">
              Steg 3: Nøkkelord fra tavler ({boardKeywords.length})
            </Heading>
            {boardKeywords.length === 0 ? (
              <Alert variant="warning" size="small">
                Ingen nøkkelord konfigurert på aktive tavler for dette teamet
              </Alert>
            ) : (
              <VStack gap="space-4">
                {[...keywordsByBoard.entries()].map(([boardId, { boardName, keywords }]) => (
                  <Box key={boardId} padding="space-4" background="raised" borderRadius="4">
                    <VStack gap="space-2">
                      <BodyShort size="small" weight="semibold">
                        📋 {boardName}
                      </BodyShort>
                      <BodyShort size="small" textColor="subtle">
                        Periode: {new Date(keywords[0].periodStart).toLocaleDateString('nb-NO')} –{' '}
                        {new Date(keywords[0].periodEnd).toLocaleDateString('nb-NO')}
                      </BodyShort>
                      <HStack gap="space-2" wrap>
                        {keywords.map((kw) => (
                          <Tag
                            key={`${kw.keyword}-${kw.objectiveId}-${kw.keyResultId}`}
                            variant={ambiguousKeywords.has(kw.keyword.toLowerCase()) ? 'warning' : 'neutral'}
                            size="small"
                          >
                            {kw.keyword}
                            {kw.keyResultTitle ? ` → ${kw.keyResultTitle}` : ` → ${kw.objectiveTitle}`}
                          </Tag>
                        ))}
                      </HStack>
                    </VStack>
                  </Box>
                ))}
              </VStack>
            )}
            {ambiguousKeywords.size > 0 && (
              <Alert variant="warning" size="small">
                Tvetydige nøkkelord (finnes i flere tavler, ignoreres): {[...ambiguousKeywords].join(', ')}
              </Alert>
            )}
          </VStack>
        </Box>

        {/* Step 4: Matching results */}
        <Box background="neutral-soft" padding="space-4" borderRadius="8">
          <VStack gap="space-4">
            <Heading size="small" level="2">
              Steg 4: Matchingsresultat
            </Heading>
            {matches.length > 0 ? (
              <VStack gap="space-2">
                {matches.map((m) => (
                  <Box
                    key={`${m.objectiveId}:${m.keyResultId ?? 'obj'}`}
                    padding="space-2"
                    background="success-soft"
                    borderRadius="4"
                  >
                    <HStack gap="space-2" align="center">
                      <Tag variant="success" size="small">
                        ✓ Match
                      </Tag>
                      <BodyShort size="small">
                        Nøkkelord &quot;{m.keyword}&quot; → {m.objectiveTitle}
                        {m.keyResultTitle ? ` / ${m.keyResultTitle}` : ''}
                      </BodyShort>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <BodyShort size="small">Ingen match funnet. Mulige årsaker:</BodyShort>
            )}
            {matches.length === 0 && (
              <VStack gap="space-1">
                <BodyShort size="small">• Ingen av nøkkelordene finnes i commit-meldingene</BodyShort>
                <BodyShort size="small">• Commit-datoen er utenfor tavlens periode</BodyShort>
                <BodyShort size="small">• Nøkkelord ble funnet, men er tvetydige (finnes i flere tavler)</BodyShort>
                <BodyShort size="small">• Ingen nøkkelord er konfigurert på tavlens mål</BodyShort>
              </VStack>
            )}
          </VStack>
        </Box>

        {/* Existing links */}
        <Box background="neutral-soft" padding="space-4" borderRadius="8">
          <VStack gap="space-4">
            <Heading size="small" level="2">
              Eksisterende koblinger ({existingLinks.length})
            </Heading>
            {existingLinks.length > 0 ? (
              <VStack gap="space-2">
                {existingLinks.map((link) => (
                  <Box
                    key={`${link.objective_id}:${link.key_result_id ?? 'obj'}`}
                    padding="space-2"
                    background="raised"
                    borderRadius="4"
                  >
                    <HStack gap="space-2" align="center">
                      <Tag variant="info" size="small">
                        {link.link_method}
                      </Tag>
                      <BodyShort size="small">
                        {link.objective_title ?? `Mål #${link.objective_id}`}
                        {link.key_result_title ? ` / ${link.key_result_title}` : ''}
                      </BodyShort>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <BodyShort size="small">Ingen aktive koblinger for denne deploymenten</BodyShort>
            )}
          </VStack>
        </Box>
      </VStack>
    </Box>
  )
}
