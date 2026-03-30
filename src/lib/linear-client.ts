/**
 * Linear GraphQL API (server-side only). https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

const LINEAR_API = 'https://api.linear.app/graphql'

export type LinearTeam = { id: string; key: string; name: string }

export async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  })
  const text = await res.text()
  let json: { data?: T; errors?: { message: string }[] }
  try {
    json = JSON.parse(text) as typeof json
  } catch {
    throw new Error(`Linear: invalid JSON (${res.status})`)
  }
  if (!res.ok) {
    throw new Error(`Linear HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  if (json.data === undefined) {
    throw new Error('Linear: empty data')
  }
  return json.data
}

const TEAMS_QUERY = `
  query Teams {
    teams {
      nodes {
        id
        key
        name
      }
    }
  }
`

export async function listLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await linearGraphql<{ teams: { nodes: LinearTeam[] } }>(apiKey, TEAMS_QUERY)
  return data.teams?.nodes ?? []
}

const ISSUE_CREATE = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        url
        identifier
      }
    }
  }
`

export type CreateIssueResult = { url: string; identifier: string; id: string }

export async function createLinearIssue(
  apiKey: string,
  input: { teamId: string; title: string; description?: string },
): Promise<CreateIssueResult> {
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean
      issue: { id: string; url: string; identifier: string } | null
    }
  }>(apiKey, ISSUE_CREATE, {
    input: {
      teamId: input.teamId,
      title: input.title.slice(0, 500),
      description: input.description?.slice(0, 25000),
    },
  })
  if (!data.issueCreate?.success || !data.issueCreate.issue?.url) {
    throw new Error('Linear: issueCreate failed')
  }
  const issue = data.issueCreate.issue
  return { url: issue.url, identifier: issue.identifier, id: issue.id }
}
