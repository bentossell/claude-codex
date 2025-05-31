import { prisma } from '../src/lib/prisma';

async function checkUser() {
  console.log('Checking users in database...\n');
  
  // Check specific user
  const userId = '8407278';
  const userById = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  console.log(`User with ID ${userId}:`, userById || 'NOT FOUND');
  
  // Check by email
  const email = 'ben.tossell@gmail.com';
  const userByEmail = await prisma.user.findUnique({
    where: { email }
  });
  
  console.log(`\nUser with email ${email}:`, userByEmail);
  
  // List all users
  const allUsers = await prisma.user.findMany();
  console.log(`\nTotal users in database: ${allUsers.length}`);
  allUsers.forEach(user => {
    console.log(`- ID: ${user.id}, Email: ${user.email}, Name: ${user.name}`);
  });
  
  process.exit(0);
}

checkUser().catch(console.error);