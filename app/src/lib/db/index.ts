import mysql from 'mysql2/promise'
import { CREATE_TABLES, MIGRATIONS } from './schema'

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/gitverse',
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
})

export async function initDB() {
  const statements = CREATE_TABLES.split(';').filter(s => s.trim())
  for (const stmt of statements) {
    await pool.execute(stmt + ';')
  }
  for (const migration of MIGRATIONS) {
    try {
      await pool.execute(migration)
    } catch {
      // Column may already exist or not supported
    }
  }
}

async function retryQuery<T>(sql: string, params?: unknown[], retries = 2): Promise<T[]> {
  for (let i = 0; i <= retries; i++) {
    try {
      const [rows] = await pool.execute(sql, params as Parameters<typeof pool.execute>[1])
      return rows as T[]
    } catch (err: unknown) {
      if (i === retries) throw err
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('ECONNREFUSED') || msg.includes('PROTOCOL') || msg.includes('ETIMEDOUT')) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        continue
      }
      throw err
    }
  }
  throw new Error('DB query failed after retries')
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  return retryQuery<T>(sql, params)
}

export default pool
