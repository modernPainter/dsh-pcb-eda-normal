/**
 * Single authoritative contract for the AI quota-reset grant API.
 *
 * Mirrors `homeForEDA/src/shared/services/ai-api.ts`:
 *   GET  `{origin}/user-rest/api/ai/reset/my?status=0` → pending grant list
 *   POST `{origin}/user-rest/api/ai/reset/use` body `{ grantId }` → use one
 *
 * Both halves import the types (the browser half type-only), and the node
 * half's parser is the ONE place an upstream payload is turned into a view.
 * Intentionally dependency-free so the browser bundle can import the types
 * without pulling node modules in — same shape as `./subscription-balances.ts`.
 *
 * The upstream envelope is `{ code, message, result | data }` with success
 * codes 200 / 200000 (see the reference project's `unwrapBackendPayload`).
 * A `null` result on the list endpoint means "no grants" (the reference
 * client maps it to `[]`), NOT a failed request.
 */

/** Path prefix under the environment-resolved eda.cn origin. */
export const RESET_API_PREFIX = '/user-rest/api/ai/reset'

/** `0` = 未用. Only pending grants count as an available reset. */
export const RESET_GRANT_STATUS_PENDING = 0

/** Business codes accepted from the reset API. */
export const RESET_SUCCESS_CODES: readonly number[] = [200, 200000]

/** One grant record. Only the two fields the UI needs are kept. */
export interface ResetGrantVO {
  id: number
  status: number
}

/** Client-facing view of "how many resets are left". */
export interface ResetGrantsView {
  /** Number of pending (`status === 0`) grants. */
  count: number
  /** Id of the first pending grant — the one the「立即重置」action consumes. */
  pendingGrantId: number | null
}

/** Result of using one grant (quota snapshot before/after the reset). */
export interface ResetUseResultVO {
  grantId: number
  quotaBefore?: number | null
  quotaAfter?: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Resolve the shared upstream envelope into its payload. */
function unwrapPayload(payload: unknown): { ok: boolean; value: unknown } {
  const body = asRecord(payload)
  if (!body || !('code' in body)) return { ok: false, value: null }
  const code = body.code
  if (typeof code !== 'number' || !RESET_SUCCESS_CODES.includes(code)) {
    return { ok: false, value: null }
  }
  const value = body.result !== undefined ? body.result : body.data
  return { ok: true, value: value ?? null }
}

export function buildResetGrantsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${RESET_API_PREFIX}/my?status=${RESET_GRANT_STATUS_PENDING}`
}

export function buildResetUseUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${RESET_API_PREFIX}/use`
}

/**
 * Validate a `/reset/my` payload. `[]` for a successful but empty/null
 * result; `null` for a failed business code or a malformed record (callers
 * degrade to「—」rather than guessing).
 */
export function parseResetGrantsPayload(payload: unknown): ResetGrantVO[] | null {
  const { ok, value } = unwrapPayload(payload)
  if (!ok) return null
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) return null
  const grants: ResetGrantVO[] = []
  for (const raw of value) {
    const record = asRecord(raw)
    if (!record) return null
    const id = numberOrNull(record.id)
    const status = numberOrNull(record.status)
    if (id === null || status === null) return null
    grants.push({ id, status })
  }
  return grants
}

/** Parse + count in one step — the single upstream→view normalization. */
export function resetGrantsViewFromPayload(payload: unknown): ResetGrantsView | null {
  const grants = parseResetGrantsPayload(payload)
  if (!grants) return null
  const pending = grants.filter((grant) => grant.status === RESET_GRANT_STATUS_PENDING)
  const first = pending[0]
  return {
    count: pending.length,
    pendingGrantId: first ? first.id : null,
  }
}

/**
 * Validate a `/reset/use` payload. An empty result still counts as success —
 * the grant may already be consumed upstream, so refusing it would only leave
 * the UI showing a stale count. `grantId` comes from the request, not the
 * response.
 */
export function parseResetUsePayload(payload: unknown, grantId: number): ResetUseResultVO | null {
  const { ok, value } = unwrapPayload(payload)
  if (!ok) return null
  const record = asRecord(value)
  const result: ResetUseResultVO = { grantId }
  if (record) {
    const quotaBefore = numberOrNull(record.quotaBefore)
    const quotaAfter = numberOrNull(record.quotaAfter)
    if (quotaBefore !== null) result.quotaBefore = quotaBefore
    if (quotaAfter !== null) result.quotaAfter = quotaAfter
  }
  return result
}
