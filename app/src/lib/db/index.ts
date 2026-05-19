import mysql from 'mysql2/promise'
import { CREATE_TABLES, MIGRATIONS } from './schema'

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/gitverse',
  waitForConnections: true,
  connectionLimit: 5,
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

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params as Parameters<typeof pool.execute>[1])
  return rows as T[]
}

export default pool
