/**
 * SQL-snippet som ekskluderer deployments fra før en applikasjons
 * `audit_start_year`. Skal brukes overalt hvor deployments telles eller
 * listes for sluttbruker, slik at pre-revisjons-deployments ikke regnes
 * som mangler/avvik.
 *
 * Forutsetter at queryen joiner `monitored_applications` med alias `ma`
 * og `deployments` med alias `d`.
 */
export const AUDIT_START_YEAR_FILTER =
  '(ma.audit_start_year IS NULL OR d.created_at >= make_date(ma.audit_start_year, 1, 1))'
