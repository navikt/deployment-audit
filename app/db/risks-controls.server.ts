import { pool } from './connection.server'

export interface RiskOrControl {
  id: number
  section_id: number | null
  category: 'risk' | 'control'
  short_title: string
  long_title: string
  status: 'active' | 'mitigated' | 'accepted' | 'closed'
  severity: 'low' | 'medium' | 'high' | 'critical' | null
  created_by: string | null
  created_at: Date
  updated_at: Date
}

export interface RiskOrControlWithSection extends RiskOrControl {
  section_name: string | null
}

export async function getAllRisksAndControls(): Promise<RiskOrControlWithSection[]> {
  const result = await pool.query(
    `SELECT rc.*, s.name AS section_name
     FROM risks_and_controls rc
     LEFT JOIN sections s ON s.id = rc.section_id
     ORDER BY rc.category, rc.created_at DESC`,
  )
  return result.rows
}

export async function searchRisksAndControls(query: string): Promise<RiskOrControlWithSection[]> {
  const result = await pool.query(
    `SELECT rc.*, s.name AS section_name
     FROM risks_and_controls rc
     LEFT JOIN sections s ON s.id = rc.section_id
     WHERE rc.short_title ILIKE $1 OR rc.long_title ILIKE $1
     ORDER BY rc.category, rc.created_at DESC`,
    [`%${query}%`],
  )
  return result.rows
}

export async function getRiskOrControlById(id: number): Promise<RiskOrControl | null> {
  const result = await pool.query('SELECT * FROM risks_and_controls WHERE id = $1', [id])
  return result.rows[0] ?? null
}

export async function createRiskOrControl(data: {
  section_id?: number | null
  category: 'risk' | 'control'
  short_title: string
  long_title?: string
  status?: string
  severity?: string | null
  created_by?: string
}): Promise<RiskOrControl> {
  const result = await pool.query(
    `INSERT INTO risks_and_controls (section_id, category, short_title, long_title, status, severity, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      data.section_id ?? null,
      data.category,
      data.short_title,
      data.long_title ?? '',
      data.status ?? 'active',
      data.severity ?? null,
      data.created_by ?? null,
    ],
  )
  return result.rows[0]
}

export async function updateRiskOrControl(
  id: number,
  data: {
    short_title?: string
    long_title?: string
    status?: string
    severity?: string | null
    section_id?: number | null
  },
): Promise<RiskOrControl | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (data.short_title !== undefined) {
    sets.push(`short_title = $${idx++}`)
    values.push(data.short_title)
  }
  if (data.long_title !== undefined) {
    sets.push(`long_title = $${idx++}`)
    values.push(data.long_title)
  }
  if (data.status !== undefined) {
    sets.push(`status = $${idx++}`)
    values.push(data.status)
  }
  if (data.severity !== undefined) {
    sets.push(`severity = $${idx++}`)
    values.push(data.severity)
  }
  if (data.section_id !== undefined) {
    sets.push(`section_id = $${idx++}`)
    values.push(data.section_id)
  }

  if (sets.length === 0) return getRiskOrControlById(id)

  sets.push(`updated_at = NOW()`)
  values.push(id)
  const result = await pool.query(
    `UPDATE risks_and_controls SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  )
  return result.rows[0] ?? null
}

export async function deleteRiskOrControl(id: number): Promise<boolean> {
  const result = await pool.query('DELETE FROM risks_and_controls WHERE id = $1', [id])
  return (result.rowCount ?? 0) > 0
}
