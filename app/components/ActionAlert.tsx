import { Alert } from '@navikt/ds-react'

/**
 * Displays success and/or error alerts based on action data.
 * Replaces the common pattern of two conditional Alert renders in routes.
 */
export function ActionAlert({ data }: { data?: { success?: string; error?: string } | null }) {
  if (!data) return null
  return (
    <>
      {data.success && <Alert variant="success">{data.success}</Alert>}
      {data.error && <Alert variant="error">{data.error}</Alert>}
    </>
  )
}
