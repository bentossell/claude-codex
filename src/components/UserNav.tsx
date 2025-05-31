import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { UserMenu } from './UserMenu';

export async function UserNav() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) return null;

  return <UserMenu user={session.user} />;
}