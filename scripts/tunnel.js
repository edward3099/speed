#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');

console.log('🚀 Starting Next.js dev server...');

// Start Next.js dev server
const nextProcess = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true
});

// Wait for Next.js to be ready (check if port 3000 is listening)
function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkServer = () => {
      const req = http.get('http://localhost:3000', (res) => {
        console.log('✅ Next.js dev server is ready!');
        resolve();
      });
      
      req.on('error', () => {
        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error('Next.js server did not start in time'));
        } else {
          setTimeout(checkServer, 1000);
        }
      });
      
      req.setTimeout(500, () => {
        req.destroy();
        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error('Next.js server did not start in time'));
        } else {
          setTimeout(checkServer, 1000);
        }
      });
    };
    checkServer();
  });
}

// Start Cloudflare tunnel after Next.js is ready
waitForServer()
  .then(() => {
    console.log('🌐 Starting Cloudflare tunnel...');
    console.log('📡 Your app will be available at the URL shown below:\n');
    
    const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:3000'], {
      stdio: 'inherit',
      shell: false
    });

    // Handle cleanup
    const cleanup = () => {
      console.log('\n🛑 Shutting down...');
      nextProcess.kill();
      tunnelProcess.kill();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    nextProcess.on('exit', (code) => {
      console.log(`\n⚠️  Next.js process exited with code ${code}`);
      tunnelProcess.kill();
      process.exit(code || 0);
    });

    tunnelProcess.on('exit', (code) => {
      console.log(`\n⚠️  Cloudflare tunnel exited with code ${code}`);
      nextProcess.kill();
      process.exit(code || 0);
    });
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    nextProcess.kill();
    process.exit(1);
  });
