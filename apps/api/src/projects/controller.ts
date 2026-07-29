/**
 * HTTP surface of the project registry.
 *
 * The controller does three things and no more: turn a request into validated
 * input, resolve who is asking, and shape the answer. Every rule about what may
 * happen lives in `registry.ts`, so there is no second place where a decision
 * could be made differently.
 */

import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../errors.ts';
import { GitHubClient } from '../github/client.ts';
import type { Actor } from './policy.ts';
import {
  createProjectSchema,
  paginationSchema,
  parseOrThrow,
  renameProjectSchema,
  requireIdempotencyKey,
  toProjectView,
  type Page,
  type ProjectView,
} from './contracts.ts';
import { ProjectRegistry } from './registry.ts';

/** Resolves the caller from their session. */
export interface ActorResolver {
  resolve(request: FastifyRequest): Promise<Actor | null>;
}

export class ProjectsController {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly github: GitHubClient,
    private readonly actors: ActorResolver,
    private readonly now: () => Date,
  ) {}

  /**
   * AC-01. An unauthenticated caller learns nothing at all — not whether the
   * organization exists, not whether the project does.
   */
  async #actor(request: FastifyRequest): Promise<Actor> {
    const actor = await this.actors.resolve(request);
    if (actor === null) throw new ApiError('UNAUTHENTICATED');
    return actor;
  }

  async create(
    request: FastifyRequest,
    body: unknown,
    idempotencyHeader: string | string[] | undefined,
  ): Promise<ProjectView> {
    const actor = await this.#actor(request);
    const idempotencyKey = requireIdempotencyKey(idempotencyHeader);
    const input = parseOrThrow(createProjectSchema, body);

    // AC-06. The repository is read from GitHub here; nothing the browser sent
    // about it is carried forward. `owner` and `repo` only say what to look up.
    const repository = await this.github.getRepository(input.owner, input.repo);

    const { project } = await this.registry.register({
      actor,
      name: input.name,
      installationId: input.installationId,
      repository,
      idempotencyKey,
      correlationId: correlationOf(request),
      requestFingerprint: JSON.stringify([
        input.name,
        input.installationId,
        input.owner,
        input.repo,
      ]),
    });
    return toProjectView(project, this.now());
  }

  async list(request: FastifyRequest, query: unknown): Promise<Page<ProjectView>> {
    const actor = await this.#actor(request);
    const page = parseOrThrow(paginationSchema, query, 'PAGINATION_INVALID');
    const result = await this.registry.list(actor, page);
    return {
      items: result.items.map((project) => toProjectView(project, this.now())),
      nextCursor: result.nextCursor,
    };
  }

  async get(request: FastifyRequest, projectId: string): Promise<ProjectView> {
    const actor = await this.#actor(request);
    return toProjectView(await this.registry.get(actor, projectId), this.now());
  }

  async rename(request: FastifyRequest, projectId: string, body: unknown): Promise<ProjectView> {
    const actor = await this.#actor(request);
    const input = parseOrThrow(renameProjectSchema, body);
    const project = await this.registry.rename({
      actor,
      projectId,
      name: input.name,
      expectedVersion: input.expectedVersion,
      correlationId: correlationOf(request),
    });
    return toProjectView(project, this.now());
  }
}

function correlationOf(request: FastifyRequest): string {
  const header = request.headers['x-correlation-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)
    ? value
    : crypto.randomUUID();
}

/**
 * Nest binding.
 *
 * Kept separate from the class above so the routes can be exercised over HTTP
 * while the same logic stays callable directly in tests that have no need for a
 * request object.
 */
@Controller('projects')
export class ProjectsRoutes {
  constructor(private readonly controller: ProjectsController) {}

  @Post()
  create(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<ProjectView> {
    return this.controller.create(request, body, idempotencyKey);
  }

  @Get()
  list(@Req() request: FastifyRequest, @Query() query: unknown): Promise<Page<ProjectView>> {
    return this.controller.list(request, query);
  }

  @Get(':id')
  get(@Req() request: FastifyRequest, @Param('id') id: string): Promise<ProjectView> {
    return this.controller.get(request, id);
  }

  @Patch(':id')
  rename(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProjectView> {
    return this.controller.rename(request, id, body);
  }
}
