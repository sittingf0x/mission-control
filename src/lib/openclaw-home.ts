/**
 * Host path for OpenClaw workspace (registry, Kanban, .active-company).
 * Production: bind-mount host ~/.openclaw → /openclaw-home (see docker-compose.override.yml).
 */
export function getOpenClawHome(): string {
  return process.env.OPENCLAW_HOME?.trim() || '/openclaw-home'
}
