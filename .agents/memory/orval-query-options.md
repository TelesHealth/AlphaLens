---
name: Orval query option overrides
description: TS requirement when overriding TanStack Query options on orval-generated hooks
---

When you override TanStack Query options on an orval-generated hook (e.g.
`useGetPortfolio({ query: { refetchInterval: 60000 } })`), TypeScript fails with
`TS2741: Property 'queryKey' is missing` because the override object is typed as
the full `UseQueryOptions` (queryKey required), not a partial.

**Fix:** import the generated key helper and pass it explicitly:
`useGetPortfolio({ query: { queryKey: getGetPortfolioQueryKey(), refetchInterval: 60000 } })`.

**Why:** orval exports a `getXxxQueryKey()` for each query hook from
`@workspace/api-client-react`; the hook only auto-fills the key when no `query`
override is given. As soon as you provide overrides, you own the full options object.

**How to apply:** any time you add `refetchInterval`, `enabled`, `staleTime`, etc.
to a generated query hook, also import and pass `getXxxQueryKey()`.
