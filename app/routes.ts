import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  layout('routes/layout.tsx', [
    index('routes/home.tsx'),
    route('repos', 'routes/repos.tsx'),
    route('repos/search', 'routes/repos.search.tsx'),
    route('repos/:id', 'routes/repos.$id.tsx'),
    route('deployments', 'routes/deployments.tsx'),
    route('deployments/:id', 'routes/deployments.$id.tsx'),
    route('tertial-boards', 'routes/tertial-boards.tsx'),
    route('tertial-boards/new', 'routes/tertial-boards.new.tsx'),
    route('tertial-boards/:id', 'routes/tertial-boards.$id.tsx'),
  ]),
] satisfies RouteConfig;
