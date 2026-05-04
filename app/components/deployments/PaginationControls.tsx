import { ChevronLeftIcon, ChevronRightIcon } from '@navikt/aksel-icons'
import { BodyShort, Button, HStack } from '@navikt/ds-react'

interface PaginationControlsProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function PaginationControls({ page, totalPages, onPageChange }: PaginationControlsProps) {
  if (totalPages <= 1) return null

  return (
    <HStack gap="space-16" justify="center" align="center">
      <Button
        variant="tertiary"
        size="small"
        icon={<ChevronLeftIcon aria-hidden />}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Forrige
      </Button>
      <BodyShort>
        Side {page} av {totalPages}
      </BodyShort>
      <Button
        variant="tertiary"
        size="small"
        icon={<ChevronRightIcon aria-hidden />}
        iconPosition="right"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Neste
      </Button>
    </HStack>
  )
}
