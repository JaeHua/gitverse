import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function getSession() {
  return getServerSession(authOptions)
}

export async function requireAuth(): Promise<{ userId: string; userName: string }> {
  const session = await getSession()
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED')
  }
  return { userId: session.user.id, userName: session.user.name || 'Unknown' }
}
