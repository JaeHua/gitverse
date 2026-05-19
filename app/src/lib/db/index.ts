import mysql from 'mysql2/promise'
import { CREATE_TABLES } from './schema'

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
}

export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export default pool
