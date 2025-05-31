import { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  // adapter: PrismaAdapter(prisma), // Commented out for JWT strategy
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email repo'
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account && user) {
        // First time login - need to get the database user
        const email = user.email || (profile as any)?.email;
        const githubId = (profile as any)?.id?.toString();
        
        if (email) {
          // Get the actual database user
          const dbUser = await prisma.user.findUnique({
            where: { email }
          });
          
          if (dbUser) {
            token.id = dbUser.id; // Use database ID, not GitHub ID
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.picture = dbUser.image;
            token.githubId = dbUser.githubId;
          }
        }
        
        // Store access token for API calls
        if (account.access_token) {
          token.accessToken = account.access_token;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === 'github' && profile) {
        try {
          // Create or update user in database
          const githubId = (profile as any).id?.toString();
          const email = user.email || (profile as any).email;
          
          await prisma.user.upsert({
            where: { email },
            update: {
              name: user.name,
              image: user.image,
              githubId
            },
            create: {
              email,
              name: user.name,
              image: user.image,
              githubId
            }
          });
        } catch (error) {
          console.error('Error creating/updating user:', error);
          return false;
        }
      }
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  },
  session: {
    strategy: 'jwt'
  }
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string;
      image?: string;
    };
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    githubId?: string;
    accessToken?: string;
  }
}