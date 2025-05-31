import { prisma } from '../src/lib/prisma';

async function checkTasks() {
  console.log('Checking all tasks in database...\n');
  
  // Get all tasks
  const allTasks = await prisma.task.findMany({
    include: {
      author: true
    }
  });
  
  console.log(`Total tasks: ${allTasks.length}`);
  allTasks.forEach(task => {
    console.log(`\nTask: ${task.id}`);
    console.log(`  Title: ${task.title}`);
    console.log(`  Status: ${task.status}`);
    console.log(`  Author ID: ${task.authorId}`);
    console.log(`  Author Email: ${task.author.email}`);
    console.log(`  Created: ${task.createdAt}`);
  });
  
  // Get current user
  const users = await prisma.user.findMany();
  console.log(`\n\nTotal users: ${users.length}`);
  users.forEach(user => {
    console.log(`\nUser: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  GitHub ID: ${user.githubId}`);
  });
  
  process.exit(0);
}

checkTasks().catch(console.error);