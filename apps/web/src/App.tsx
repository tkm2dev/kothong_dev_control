/**
 * The whole MVP interface.
 *
 * Three views — command centre, project detail, add project — kept in one file
 * because at this size the cost of finding them outweighs the cost of scrolling
 * past them.
 *
 * Routing is read from the path directly rather than through a router library.
 * The MVP has three routes and adding a dependency to express that would be
 * more code, not less.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError, api, type ApiFailure, type Me, type ProjectView } from './api.ts';
import { EmptyState, ErrorState, Freshness, Loading, SuccessNote } from './states.tsx';

type Route = { name: 'home' } | { name: 'project'; id: string } | { name: 'add' };

function routeFrom(pathname: string): Route {
  if (pathname === '/projects/new') return { name: 'add' };
  const match = /^\/projects\/([^/]+)$/.exec(pathname);
  return match === null ? { name: 'home' } : { name: 'project', id: match[1]! };
}

function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const failureOf = (error: unknown): ApiFailure =>
  error instanceof ApiRequestError
    ? error.failure
    : { code: 'INTERNAL_ERROR', message: 'Something went wrong.', correlationId: null };

/** Loads once and reports which of the four states it is in. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[]): {
  data: T | null;
  failure: ApiFailure | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    load()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(failureOf(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The dependency list comes from the caller and is spread here, so the rule
    // cannot see it. `load` is deliberately excluded: it is a fresh closure on
    // every render, and including it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, failure, loading, reload: () => setAttempt((a) => a + 1) };
}

function Nav({ route }: { route: Route }): ReactNode {
  return (
    <nav className="nav" aria-label="Main">
      <span className="nav__brand">KOTHONG DEV CONTROL</span>
      <a href="/" aria-current={route.name === 'home' ? 'page' : undefined}>
        Command Center
      </a>
      <a href="/projects/new" aria-current={route.name === 'add' ? 'page' : undefined}>
        Add Project
      </a>
      <form method="post" action="/api/auth/logout">
        <button type="submit">Sign out</button>
      </form>
    </nav>
  );
}

function ProjectCard({ project }: { project: ProjectView }): ReactNode {
  return (
    <a
      className="card stack"
      href={`/projects/${project.id}`}
      data-testid="project-card"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <strong>{project.name}</strong>
      <span className="muted">
        {project.repository.ownerLogin}/{project.repository.repositoryName}
      </span>
      <div className="row">
        <span className="status status--info">
          <span aria-hidden="true">◆</span> {project.repository.visibility}
        </span>
        <span className="status status--info">
          <span aria-hidden="true">⌥</span> {project.repository.defaultBranch}
        </span>
        <span
          className={`status ${
            project.repository.accessStatus === 'ACCESSIBLE' ? 'status--ok' : 'status--attention'
          }`}
        >
          <span aria-hidden="true">
            {project.repository.accessStatus === 'ACCESSIBLE' ? '✓' : '▲'}
          </span>
          {project.repository.accessStatus}
        </span>
      </div>
      <Freshness freshness={project.freshness} lastVerifiedAt={project.lastVerifiedAt} />
    </a>
  );
}

function Home({ me }: { me: Me }): ReactNode {
  const { data, failure, loading, reload } = useLoad(() => api.listProjects(), []);
  const canManage = me.permissions.includes('project:manage');

  return (
    <>
      <div className="page-header">
        <h1>Command Center</h1>
        {canManage && (
          <a className="button primary" href="/projects/new">
            Add Project
          </a>
        )}
      </div>

      <section aria-labelledby="projects-heading" className="stack">
        <h2 id="projects-heading">Projects</h2>
        {loading && <Loading what="projects" />}
        {failure !== null && <ErrorState failure={failure} onRetry={reload} />}
        {!loading && failure === null && data !== null && data.items.length === 0 && (
          <EmptyState
            title="No projects yet"
            hint="Register a GitHub repository to start tracking work against it."
            action={
              canManage ? (
                <a className="button primary" href="/projects/new">
                  Add Project
                </a>
              ) : undefined
            }
          />
        )}
        {data !== null && data.items.length > 0 && (
          <div className="grid">
            {data.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="stack" style={{ marginTop: 32 }}>
        <h2 id="activity-heading">Active pull requests and CI</h2>
        {/* Reading pull requests and checks from GitHub is Slice 4. Saying so
            plainly is better than an empty panel that looks broken. */}
        <EmptyState
          title="Not available yet"
          hint="Pull request and CI status arrive with GitHub synchronisation. Recorded in the backlog."
        />
      </section>
    </>
  );
}

function ProjectDetail({ id }: { id: string }): ReactNode {
  const { data, failure, loading, reload } = useLoad(() => api.getProject(id), [id]);

  if (loading) return <Loading what="the project" />;
  if (failure !== null) return <ErrorState failure={failure} onRetry={reload} />;
  if (data === null) return null;

  const rows: Array<[string, ReactNode]> = [
    ['Repository', `${data.repository.ownerLogin}/${data.repository.repositoryName}`],
    // The external id is what the binding is actually keyed on, and it survives
    // a rename, so it is the value worth showing to verify against GitHub.
    ['External repository ID', <code key="id">{data.repository.externalRepositoryId}</code>],
    ['Visibility', data.repository.visibility],
    ['Default branch', data.repository.defaultBranch],
    ['Access status', data.repository.accessStatus],
    ['Version', String(data.version)],
  ];

  return (
    <>
      <div className="page-header">
        <h1>{data.name}</h1>
        <a className="button" href="/">
          Back
        </a>
      </div>
      <div className="card stack" data-testid="project-detail">
        {rows.map(([label, value]) => (
          <div className="record" key={label}>
            <span className="record__label">{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <Freshness freshness={data.freshness} lastVerifiedAt={data.lastVerifiedAt} />
      </div>
    </>
  );
}

function AddProject(): ReactNode {
  const [name, setName] = useState('');
  const [installationId, setInstallationId] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [created, setCreated] = useState<ProjectView | null>(null);

  // Generated once per form, not per attempt. A key that changed on retry would
  // make the second attempt look like a new request and defeat AC-09.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const submit = useCallback(
    async (event: { preventDefault: () => void }) => {
      event.preventDefault();
      setBusy(true);
      setFailure(null);
      try {
        setCreated(await api.createProject({ name, installationId, owner, repo, idempotencyKey }));
      } catch (error) {
        setFailure(failureOf(error));
      } finally {
        setBusy(false);
      }
    },
    [name, installationId, owner, repo, idempotencyKey],
  );

  if (created !== null) {
    return (
      <>
        <div className="page-header">
          <h1>Project registered</h1>
        </div>
        <div className="card stack">
          <SuccessNote>{created.name} is now tracked.</SuccessNote>
          <div className="row">
            <a className="button primary" href={`/projects/${created.id}`}>
              View project
            </a>
            <a className="button" href="/">
              Back to Command Center
            </a>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Add Project</h1>
      </div>
      <form className="card stack" onSubmit={submit} data-testid="add-project-form">
        {failure !== null && <ErrorState failure={failure} />}

        <label className="stack">
          <span>Project name</span>
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="stack">
          <span>GitHub installation</span>
          <input
            name="installationId"
            value={installationId}
            onChange={(e) => setInstallationId(e.target.value)}
            required
          />
        </label>
        <div className="row">
          <label className="stack" style={{ flex: 1 }}>
            <span>Repository owner</span>
            <input name="owner" value={owner} onChange={(e) => setOwner(e.target.value)} required />
          </label>
          <label className="stack" style={{ flex: 1 }}>
            <span>Repository name</span>
            <input name="repo" value={repo} onChange={(e) => setRepo(e.target.value)} required />
          </label>
        </div>

        <p className="muted">
          Everything else is read from GitHub when you submit. Nothing typed here decides what is
          stored.
        </p>

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Registering…' : 'Register project'}
          </button>
          <a className="button" href="/">
            Cancel
          </a>
        </div>
        {busy && <Loading what="repository details from GitHub" />}
      </form>
    </>
  );
}

export function App(): ReactNode {
  const [route, setRoute] = useState<Route>(() => routeFrom(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(routeFrom(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      const href = anchor?.getAttribute('href');
      if (anchor === null || anchor === undefined || href === null || href === undefined) return;
      if (!href.startsWith('/') || anchor.hasAttribute('download')) return;
      event.preventDefault();
      navigate(href);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const { data: me, failure, loading } = useLoad(() => api.me(), []);

  if (loading) {
    return (
      <div className="main">
        <Loading what="your session" />
      </div>
    );
  }

  // Not signed in, or the session ended. The sign-in link is the only thing
  // offered; nothing about the organization is shown to someone unauthenticated.
  if (failure !== null || me === null) {
    return (
      <div className="main">
        <div className="card stack" data-testid="signed-out">
          <h1>KOTHONG DEV CONTROL</h1>
          <p className="muted">Sign in with GitHub to continue.</p>
          <div>
            <a className="button primary" href="/api/auth/github/start" data-testid="sign-in">
              Sign in with GitHub
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <Nav route={route} />
      <main className="main">
        {route.name === 'home' && <Home me={me} />}
        {route.name === 'project' && <ProjectDetail id={route.id} />}
        {route.name === 'add' && <AddProject />}
      </main>
    </div>
  );
}
