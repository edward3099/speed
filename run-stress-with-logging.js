#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const outputFile = path.join(__dirname, 'stress-test-output.log');
const logStream = fs.createWriteStream(outputFile, { flags: 'w' });

console.log(`Starting stress test...`);
console.log(`Output will be logged to: ${outputFile}`);
console.log('================================================\n');

const testProcess = spawn('npx', ['playwright', 'test', 'tests/100-users-stress.spec.ts', '--reporter=list'], {
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe']
});

// Log everything to file
testProcess.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output); // Show in terminal
  logStream.write(output); // Save to file
});

testProcess.stderr.on('data', (data) => {
  const output = data.toString();
  process.stderr.write(output); // Show in terminal
  logStream.write(output); // Save to file
});

testProcess.on('close', (code) => {
  logStream.end();
  console.log(`\n================================================`);
  console.log(`Test completed with exit code: ${code}`);
  console.log(`Full output saved to: ${outputFile}`);
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('Failed to start test:', error);
  logStream.end();
  process.exit(1);
});

















