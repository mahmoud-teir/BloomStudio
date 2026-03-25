import NextAuth, { NextAuthOptions } from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"
import type { Adapter } from "next-auth/adapters"
import GithubProvider from "next-auth/providers/github"
import GoogleProvider from "next-auth/providers/google"

const providers = [];

// GitHub OAuth — add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    })
  );
}

// Google OAuth — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (!process.env.NEXTAUTH_SECRET) {
  console.warn("⚠️  NEXTAUTH_SECRET is not set. Auth will not work in production. Generate one with: openssl rand -base64 32");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: providers.length > 0 ? "database" : "jwt",
  },
  callbacks: {
    session: async ({ session, user, token }) => {
      if (session?.user) {
        // Database strategy provides user, JWT strategy provides token
        (session.user as Record<string, unknown>).id = user?.id ?? token?.sub;
      }
      return session;
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
