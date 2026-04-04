-- Fix remaining has_four_eyes bug: pending_baseline and other non-approved
-- statuses also had has_four_eyes incorrectly set to true at creation.
-- The previous migration (1771960000000) only fixed four_eyes_status = 'legacy'.
UPDATE deployments
SET has_four_eyes = false
WHERE has_four_eyes = true
  AND four_eyes_status NOT IN (
    'approved',
    'manually_approved',
    'implicitly_approved',
    'no_changes',
    'approved_pr_with_unreviewed',
    'legacy'
  );
