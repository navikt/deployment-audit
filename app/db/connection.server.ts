import { Pool, type PoolClient, type QueryResult } from 'pg'

let poolInstance: Pool | null = null

function buildConnectionConfig() {
  // Nais injects individual DB_* environment variables
  const host = process.env.DB_HOST
  const port = process.env.DB_PORT
  const database = process.env.DB_DATABASE
  const user = process.env.DB_USERNAME
  const password = process.env.DB_PASSWORD

  // If Nais variables are present, use them
  if (host && database && user && password) {
    return {
      host,
      port: port ? parseInt(port, 10) : 5432,
      database,
      user,
      password,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  }

  // Fall back to DATABASE_URL for local development
  const connectionString = process.env.DATABASE_URL
  if (connectionString) {
    return { connectionString }
  }

  throw new Error('Database configuration missing. Set either DB_* variables (Nais) or DATABASE_URL (local)')
}

export function getPool(): Pool {
  if (!poolInstance) {
    const config = buildConnectionConfig()

    poolInstance = new Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
    })
  }

  return poolInstance
}

// Export pool directly for direct usage
export const pool = getPool()

export async function query<T extends Record<string, any> = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const p = getPool()
  return p.query<T>(text, params)
}

export async function getClient(): Promise<PoolClient> {
  const p = getPool()
  return p.connect()
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end()
    poolInstance = null
  }
}
