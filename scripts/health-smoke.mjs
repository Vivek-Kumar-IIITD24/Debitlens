import { spawn } from 'node:child_process';
import net from 'node:net';

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const port = await getAvailablePort();
const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
  stdio: 'pipe',
  env: { ...process.env, PORT: String(port) },
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});
const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const exitStatus = await Promise.race([exited, delay(0).then(() => null)]);
    if (exitStatus) {
      throw new Error(`Spawned server exited before health check: ${JSON.stringify(exitStatus)}\n${output}`);
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) break;
    } catch {
      // The spawned server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok) {
    throw new Error(`Health endpoint did not become ready on spawned port ${port}.\n${output}`);
  }
  const body = await response.json();
  if (body.status !== 'UP') {
    throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);
  }
  console.log(`Health smoke test passed on port ${port}:`, body.status);
} finally {
  if (child.exitCode === null) child.kill();
  if (child.exitCode === null) await exited;
}
