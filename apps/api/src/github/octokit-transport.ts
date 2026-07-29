/**
 * The real GitHub transport.
 *
 * It returns raw responses and interprets nothing. Validation happens in
 * `client.ts` against the recorded schemas, so a field GitHub adds, removes or
 * renames is caught in one place rather than wherever it happened to be read.
 *
 * Authentication is per installation. The App's own credentials are only used
 * to mint installation tokens and to read installation metadata; no repository
 * is ever read with App-level authority.
 */

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';
import type { GitHubTransport } from './client.ts';

export interface GitHubAppCredentials {
  readonly appId: string;
  readonly privateKey: string;
}

export function createOctokitTransport(credentials: GitHubAppCredentials): GitHubTransport {
  const auth = {
    appId: credentials.appId,
    // Private keys are commonly carried through the environment with escaped
    // newlines. Restoring them here means a working key is not rejected for a
    // reason that has nothing to do with the key.
    privateKey: credentials.privateKey.replace(/\\n/g, '\n'),
  };

  const app = new Octokit({ authStrategy: createAppAuth, auth });
  const forInstallation = (installationId: string) =>
    new Octokit({ authStrategy: createAppAuth, auth: { ...auth, installationId } });

  return {
    async getRepository({ installationId, owner, repo }) {
      const response = await forInstallation(installationId).rest.repos.get({ owner, repo });
      return response.data;
    },

    async listInstallationRepositories({ installationId }) {
      // Paginated rather than a single page: a list that silently stops at the
      // first hundred looks identical to an installation with fewer
      // repositories, and the user has no way to tell the difference.
      return forInstallation(installationId).paginate(
        'GET /installation/repositories',
        { per_page: 100 },
        (response) => response.data,
      );
    },

    async getInstallation({ installationId }) {
      const response = await app.rest.apps.getInstallation({
        installation_id: Number(installationId),
      });
      return response.data;
    },
  };
}
