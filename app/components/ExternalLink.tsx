import { ExternalLinkIcon } from '@navikt/aksel-icons'
import { Link as AkselLink } from '@navikt/ds-react'
import type { ComponentProps, ReactNode } from 'react'

type AkselLinkProps = ComponentProps<typeof AkselLink>

type Props = Omit<AkselLinkProps, 'target' | 'rel' | 'href'> & {
  href: string
  children: ReactNode
  /**
   * Hide the trailing icon. Default is `false`. Use sparingly — the icon is
   * what tells the user the link will navigate to a different site.
   */
  hideIcon?: boolean
}

/**
 * Link that opens in a new tab and visually indicates this with Aksel's
 * `ExternalLinkIcon`. Use for ALL links pointing to a different site
 * (GitHub, NAIS Console, Slack, Teamkatalogen, etc.).
 *
 * For internal links (same origin), use React Router's `<Link>` or Aksel's
 * `<Link>` directly — those don't need the external icon.
 *
 * Always sets `target="_blank"` and `rel="noopener noreferrer"`.
 */
export function ExternalLink({ href, children, hideIcon, ...rest }: Props) {
  return (
    <AkselLink href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
      {!hideIcon && <ExternalLinkIcon aria-hidden fontSize="1em" />}
    </AkselLink>
  )
}
