declare module '@openclaw/mc-client' {
  export function checkGatewayHealth(
    baseUrl: string,
    opts?: { retries?: number; timeout?: number },
  ): Promise<{ ok: boolean; status?: number; error?: string; data?: unknown }>
  export function readPersonaFiles(
    openclawHome: string,
    agentId: string,
  ): Promise<Record<string, string>>
  export function parseCompanyRegistryYaml(text: string): Array<{ id: string; name?: string; summary?: string }>
  export function readCompanyRegistry(
    openclawHome: string,
  ): Promise<{ ok: boolean; companies: Array<{ id: string; name?: string; summary?: string }>; error?: string }>
  export function readActiveCompany(
    openclawHome: string,
  ): Promise<{ ok: boolean; companyId: string | null; error?: string }>
  export function stripAnsi(s: string): string
  export function loadKanbanBoard(
    openclawHome: string,
    companyId: string,
    projectSlug?: string,
  ): Promise<Record<string, unknown>>
  export function saveKanbanBoard(
    openclawHome: string,
    board: Record<string, unknown>,
    companyId: string,
    projectSlug?: string,
  ): Promise<void>
  export const DEFAULT_KANBAN_COLUMNS: unknown[]
  export function kanbanBoardPath(
    openclawHome: string,
    companyId: string,
    projectSlug?: string,
  ): string
  export function appendActivity(
    board: Record<string, unknown>,
    taskId: string,
    message: string,
  ): { ok: boolean; board?: Record<string, unknown>; error?: string }
}
