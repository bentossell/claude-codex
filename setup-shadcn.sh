#!/bin/bash
cd /Users/bentossell/codex

# Initialize shadcn (already done)
# Install components
npx shadcn@latest add button -y
npx shadcn@latest add card -y
npx shadcn@latest add select -y
npx shadcn@latest add input -y
npx shadcn@latest add label -y
npx shadcn@latest add skeleton -y
npx shadcn@latest add badge -y
npx shadcn@latest add separator -y
npx shadcn@latest add alert -y
npx shadcn@latest add dropdown-menu -y
npx shadcn@latest add dialog -y

echo "Shadcn components installed!"