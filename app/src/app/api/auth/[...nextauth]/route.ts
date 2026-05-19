import NextAuth, { AuthOptions } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import { query } from '@/lib/db'

export const authOptions: AuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'github') {
        const existing = await query<{ id: string }>(
          'SELECT id FROM users WHERE email = ?',
          [user.email]
        )
        if (existing.length === 0) {
          await query(
            'INSERT INTO users (id, name, email, image) VALUES (?, ?, ?, ?)',
            [user.id, user.name, user.email, user.image]
          )
        }
      }
      return true
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
      }
      return session
    },
  },
  pages: {
    signIn: '/',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
