/**
 * Process entry point.
 *
 * It does four things: validate configuration, build the application, listen,
 * and shut down cleanly. Nothing else belongs here — anything that needs a
 * decision belongs in a module that can be tested without starting a server.
 */

import 'reflect-metadata';
import { bootstrap } from './app.ts';
import { loadConfig } from './config.ts';
import { createOAuthTransport } from './auth/http-transport.ts';
import { PUBLIC_API_PATH } from './config.ts';
import { createOctokitTransport } from './github/octokit-transport.ts';

async function main(): Promise<void> {
  // Throws on anything missing or unsafe, before a port is opened. A process
  // that starts and then fails on the first sign-in is harder to diagnose than
  // one that never starts.
  const config = loadConfig(process.env);

  const { app, pool } = await bootstrap(config, {
    github: createOctokitTransport({
      appId: config.GITHUB_APP_ID,
      privateKey: config.GITHUB_APP_PRIVATE_KEY,
    }),
    oauth: createOAuthTransport({
      clientId: config.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: config.GITHUB_OAUTH_CLIENT_SECRET,
      redirectUri: `${config.PUBLIC_ORIGIN}${PUBLIC_API_PATH}/auth/github/callback`,
    }),
  });

  // Containers reach the process from another address than localhost.
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const stop = async (): Promise<void> => {
    // Requests in flight finish before the pool closes under them.
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

main().catch((error: unknown) => {
  // The one place a console write is right: there is no logger yet and no
  // request to answer, and a silent exit would leave nothing to diagnose.
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
