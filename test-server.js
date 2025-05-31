const { exec } = require('child_process');
const http = require('http');

console.log('🧪 Starting Codex Server Tests...\n');

// Kill any existing processes on port 3000
exec('lsof -ti:3000 | xargs kill -9', () => {
  console.log('✅ Cleared port 3000');
  
  // Start the Next.js server
  console.log('🚀 Starting Next.js server...');
  const serverProcess = exec('npm run dev', { cwd: __dirname });
  
  let serverReady = false;
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`[SERVER] ${data}`);
    if (data.includes('Ready in') && !serverReady) {
      serverReady = true;
      console.log('\n✅ Server is ready!');
      runTests();
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`[ERROR] ${data}`);
  });
  
  // Run tests
  function runTests() {
    console.log('\n🧪 Running tests...\n');
    
    const tests = [
      { name: 'Homepage loads', path: '/' },
      { name: 'API health check', path: '/api/health' },
      { name: 'GitHub repos API', path: '/api/github/repos' },
    ];
    
    let completedTests = 0;
    
    tests.forEach((test, index) => {
      setTimeout(() => {
        http.get(`http://localhost:3000${test.path}`, (res) => {
          const success = res.statusCode === 200 || res.statusCode === 401; // 401 for auth-protected routes
          console.log(`${success ? '✅' : '❌'} ${test.name} - Status: ${res.statusCode}`);
          
          completedTests++;
          if (completedTests === tests.length) {
            console.log('\n🏁 All tests completed!');
            console.log('\n🌐 Server is running at http://localhost:3000');
            console.log('Press Ctrl+C to stop the server.\n');
          }
        }).on('error', (err) => {
          console.log(`❌ ${test.name} - Error: ${err.message}`);
          completedTests++;
        });
      }, index * 500); // Stagger requests
    });
  }
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping server...');
    serverProcess.kill();
    process.exit(0);
  });
});