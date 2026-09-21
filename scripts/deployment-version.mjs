import { writeFile } from 'node:fs/promises';

const sha = process.env.GITHUB_SHA;
if (!/^[0-9a-f]{40}$/.test(sha || '')) throw Error('A valid GITHUB_SHA is required');
if (process.argv[2] === 'stamp') {
  await writeFile(new URL('../dist/deployment.json', import.meta.url), JSON.stringify({ sha }));
} else if (process.argv[2] === 'verify') {
  const base = new URL(process.env.DEPLOY_URL);
  if (base.protocol !== 'https:') throw Error('Deployment URL must use HTTPS');
  let verified = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const url = new URL(`/deployment.json?version=${sha}&attempt=${attempt}`, base);
      const reply = await fetch(url, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (reply.ok && (await reply.json()).sha === sha) {
        verified = true;
        console.log(`Published version verified: ${sha}`);
        break;
      }
    } catch { /* Propagation delays and stale responses are retried within a bounded window. */ }
    if (attempt < 11) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!verified) throw Error('Published site did not serve the expected commit; check deployment and caching.');
} else {
  throw Error('Use stamp or verify');
}
