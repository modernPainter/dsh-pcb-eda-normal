/**
 * `sidebar.footer.action` entry: the Huaqiu EDA account trigger at the bottom
 * of the DSH sidebar (beside Settings).
 *
 * - Not logged in: shows the HQ icon and opens the login dialog through
 *   `auth.login({ lang, theme })` — a real modal (backdrop + centered card +
 *   auth.eda.cn iframe) that is ALWAYS TRANSPARENT in the embed itself
 *   (`fill=full` is never sent, see `lib.ts#buildLoginUrl`), and the card
 *   surface masks Blink's white base canvas so the login card floats over
 *   the dimmed app in both light and dark themes. `lang`/`theme` follow the
 *   host UI. Click on the backdrop, the × button, or Escape closes it, and
 *   auth.eda.cn's own `close_dialog` postMessage closes it as well.
 * - Logged in: the trigger becomes the user's AVATAR (`headimage` from the
 *   auth.eda.cn payload, HQ icon while it is missing/fails to load) and a click
 *   opens a context menu with「Go to profile」(the eda.cn account page, with
 *   the access token) and「Log out」— the same shape as `hq-eda-ai`'s
 *   `UserMenu`, portalled to `document.body` with fixed positioning so the
 *   sidebar's `overflow: hidden` can never clip it.
 *
 * THEMING: the LIGHT palette stays token-first (DSH `--dsw-alias-*` with an
 * explicit fallback), so a custom host theme is honored. The DARK palette is
 * deliberately EXPLICIT: it follows `docs/prototype/avatar_popup_redesign_prototype.html`,
 * whose "before" is exactly what the host token produces — `--dsw-alias-bg-overlay`
 * resolves to `rgb(97, 102, 107)` in dark mode, the muddy medium-gray surface
 * the prototype calls out as the contrast defect. Keeping the token would
 * silently re-introduce it, so the popup pins its own deep-slate color schema
 * instead. `useIsDark()` still selects the pair, driven by the same
 * `body[data-ds-dark-theme]` snapshot ui-layout's presenter writes.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getAuth, getAuthState, getHqEdge, setProfile, subscribeAuth } from '../auth-state.js'
import { buildProfileUrl, ERC_PRODUCT_CODE, GEN_PRODUCT_CODE, type AiUsage, type ResetGrantsView, type SubscriptionQuota } from '../lib.js'
import { useIsDark, useLocale } from '../ui-env.js'
import { useT, type Translate } from '../i18n.js'
import { HQ_ICON } from './hq-icon.jsx'

export interface SidebarFooterActionOwnerProps {
  wide?: boolean
}

const AVATAR_SIZE = 26
const ICON_SIZE = 22

/**
 * Local baseline behind the「新增了AI额度重置机会」avatar reminder. A reminder
 * is owed when no record exists yet, or when the API reports MORE pending
 * resets than the count the user last acknowledged. `time` is stored for
 * diagnostics only — it never expires the record.
 */
const RESET_RECORD_KEY = 'huaqiu.dsh.auth.reset-grants'

interface ResetGrantRecord {
  count: number
  time: number
}

function readResetGrantRecord(): ResetGrantRecord | null {
  try {
    const raw = window.localStorage.getItem(RESET_RECORD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { count?: unknown; time?: unknown } | null
    if (!parsed || typeof parsed.count !== 'number' || !Number.isFinite(parsed.count) || parsed.count < 0) return null
    return { count: parsed.count, time: typeof parsed.time === 'number' ? parsed.time : 0 }
  } catch {
    return null
  }
}

function writeResetGrantRecord(count: number): void {
  try {
    const record: ResetGrantRecord = { count, time: Date.now() }
    window.localStorage.setItem(RESET_RECORD_KEY, JSON.stringify(record))
  } catch {
    // Private mode / quota exceeded: the reminder simply stays available.
  }
}

/**
 * The popup's color schema. Every painted value comes from here, so the dark
 * palette can be swapped as one coherent unit. The values are the concrete
 * equivalents of the prototype's Tailwind classes (see `DARK_PALETTE`).
 */
interface Palette {
  surface: string
  /** Popup border + the 1px section dividers. */
  border: string
  text: string
  /** Header name + metric headline (prototype `text-white` in dark). */
  heading: string
  muted: string
  hover: string
  danger: string
  dangerHover: string
  avatarBg: string
  shadow: string
  /** Profile-header card background + hairline. */
  card: string
  headerBorder: string
  /** 1px hairline used on the quota metric card. */
  cardBorder: string
  /** Quota metric card background. */
  metric: string
  metricHover: string
  /** Plan badge: fill, label and hairline (prototype red-500/20 + red-400). */
  badgeBg: string
  badgeText: string
  badgeBorder: string
  /** "Online" pill: dot/text, translucent fill and hairline (emerald). */
  online: string
  onlineBg: string
  onlineBorder: string
  /** Huaqiu brand red — CTA gradient start + hover start. */
  primary: string
  primaryHover: string
  /** CTA gradient end + hover end. */
  ctaEnd: string
  ctaHoverEnd: string
  /** CTA glow. */
  ctaShadow: string
  /** Progress-bar track. */
  track: string
  /** AI metric sparkles glyph. */
  aiIcon: string
  /** GEN / ERC / AI progress gradients. */
  genGradient: string
  ercGradient: string
  aiGradient: string
}

/**
 * Light scheme keeps the DSH token-first convention (custom host themes win).
 * The extra tokens introduced for the dark redesign are filled with the values
 * that were previously hardcoded inline, so light rendering is unchanged.
 */
export const LIGHT_PALETTE: Palette = {
  surface: 'var(--dsw-alias-bg-overlay, #ffffff)',
  border: 'var(--dsw-alias-border-l1, #e4e7ec)',
  text: 'var(--dsw-alias-label-primary, #3a4356)',
  heading: 'var(--dsw-alias-label-primary, #3a4356)',
  muted: 'var(--dsw-alias-label-secondary, #8a94a6)',
  hover: 'var(--dsw-alias-interactive-bg-hover, #f5f7fa)',
  danger: 'var(--dsw-alias-state-error-primary, #d4380d)',
  dangerHover: 'rgba(216, 56, 13, 0.08)',
  avatarBg: 'var(--dsw-alias-bg-layer-2, #eef2f7)',
  shadow: '0 20px 40px -15px rgba(0, 0, 0, 0.12), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
  card: '#f7f8fa',
  headerBorder: '#e8ebf0',
  cardBorder: '#e8ebf0',
  metric: '#f7f8fa',
  metricHover: '#eef1f5',
  badgeBg: 'rgba(230, 46, 45, 0.08)',
  badgeText: '#e62e2d',
  badgeBorder: 'rgba(230, 46, 45, 0.08)',
  online: '#10b981',
  onlineBg: 'rgba(16, 185, 129, 0.10)',
  onlineBorder: 'rgba(16, 185, 129, 0.20)',
  primary: '#e62e2d',
  primaryHover: '#cc2423',
  ctaEnd: '#e11d48',
  ctaHoverEnd: '#be123c',
  ctaShadow: '0 8px 20px rgba(230, 46, 45, 0.22)',
  track: '#e4e7ec',
  aiIcon: '#10b981',
  genGradient: 'linear-gradient(90deg, #3b82f6, #6366f1)',
  ercGradient: 'linear-gradient(90deg, #a855f7, #ec4899)',
  aiGradient: 'linear-gradient(90deg, #10b981, #06b6d4)',
}

/**
 * Dark color schema from `avatar_popup_redesign_prototype.html` (the "AFTER"
 * card and the interactive popover's `dark:` classes). Explicit values, not
 * `var(--dsw-alias-*, …)`: the host's dark `--dsw-alias-bg-overlay` is
 * `rgb(97, 102, 107)`, the muddy surface the prototype replaces with a crisp
 * deep slate. Alpha-tinted badges, the cyan→blue meter and the brighter brand
 * red are the other three contrast fixes the prototype prescribes.
 */
export const DARK_PALETTE: Palette = {
  surface: '#1C1E24',                              // dark:bg-[#1C1E24]
  border: 'rgba(255, 255, 255, 0.10)',            // dark:border-white/10, dividers
  text: '#e2e8f0',                                // dark:text-slate-200
  heading: '#ffffff',                             // dark:text-white
  muted: '#94a3b8',                               // dark:text-slate-400
  hover: 'rgba(255, 255, 255, 0.05)',             // dark:hover:bg-white/5
  danger: '#f87171',                              // dark:text-red-400
  dangerHover: 'rgba(239, 68, 68, 0.10)',        // dark:hover:bg-red-500/10
  avatarBg: 'rgba(255, 255, 255, 0.10)',
  shadow: '0 16px 36px -4px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.08)', // shadow-popover-dark
  card: 'transparent',                            // flat header, no muddy card
  headerBorder: 'transparent',                    // prototype has no header outline
  cardBorder: 'rgba(255, 255, 255, 0.05)',       // dark:border-white/5
  metric: '#252831',                              // dark:bg-[#252831]
  metricHover: '#2C303A',                         // subtle lift on hover
  badgeBg: 'rgba(239, 68, 68, 0.20)',            // dark:bg-red-500/20
  badgeText: '#f87171',                           // dark:text-red-400
  badgeBorder: 'rgba(239, 68, 68, 0.20)',        // border-red-500/20
  online: '#34d399',                              // emerald-400 dot + label
  onlineBg: 'rgba(16, 185, 129, 0.10)',          // bg-emerald-500/10
  onlineBorder: 'rgba(16, 185, 129, 0.20)',      // border-emerald-500/20
  primary: '#FF4D4F',                             // eda.brand-dark
  primaryHover: '#FF6B6D',                        // eda.brand-dark-hover
  ctaEnd: '#ef4444',                             // dark:to-red-500
  ctaHoverEnd: '#f87171',                        // brightness-110 equivalent
  ctaShadow: '0 8px 20px rgba(255, 77, 79, 0.24)',
  track: '#334155',                               // dark:bg-slate-700
  aiIcon: '#22d3ee',                             // dark:text-cyan-400
  genGradient: 'linear-gradient(90deg, #3b82f6, #6366f1)',
  ercGradient: 'linear-gradient(90deg, #a855f7, #ec4899)',
  aiGradient: 'linear-gradient(90deg, #06b6d4, #3b82f6)', // cyan-500 → blue-500
}

const TRIGGER_BASE: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const MENU_BASE: CSSProperties = {
  position: 'fixed',
  zIndex: 2147483000,
  width: 320,
  padding: 12,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 16,
  fontFamily: 'inherit',
  fontSize: 13,
}

/** Avatar reminder tooltip — sits above the avatar, arrow pointing down. */
const REMINDER_BASE: CSSProperties = {
  position: 'fixed',
  zIndex: 2147483001,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: 260,
  padding: '8px 10px',
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 10,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
}

/** Redemption confirmation — a body-level dialog, never inside the menu. */
const CONFIRM_OVERLAY_BASE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483002,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '22vh 16px 16px',
  background: 'rgba(0, 0, 0, 0.55)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const CONFIRM_CARD_BASE: CSSProperties = {
  width: 300,
  maxWidth: '100%',
  padding: 20,
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 16,
  fontSize: 13,
  lineHeight: 1.6,
  boxSizing: 'border-box',
}

const MENU_HEADER_BASE: CSSProperties = {
  padding: '6px 10px 8px',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const MENU_ITEM_BASE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  font: 'inherit',
  fontSize: 13,
  textAlign: 'left',
  cursor: 'pointer',
}

/** Solid brand-coloured button for the quota-reset metric card. */
function resetButtonStyle(palette: Palette, disabled: boolean): CSSProperties {
  return {
    padding: '6px 14px',
    border: 'none',
    borderRadius: 8,
    background: palette.primary,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  }
}

/**
 * One menu row. Hover is tracked in state: the client bundle ships no CSS
 * file, so inline styles cannot express `:hover`. `trailing` renders a
 * chevron on the right (prototype nav rows), `danger` switches to the danger
 * color scheme (prototype logout).
 */
function MenuItem({
  label,
  icon,
  trailing,
  danger,
  palette,
  onSelect,
}: {
  label: string
  icon: React.JSX.Element
  trailing?: React.JSX.Element
  danger?: boolean
  palette: Palette
  onSelect: () => void
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      role="menuitem"
      style={{
        ...MENU_ITEM_BASE,
        justifyContent: 'space-between',
        color: danger ? palette.danger : palette.text,
        background: hovered ? (danger ? palette.dangerHover : palette.hover) : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          style={{
            display: 'flex',
            flex: '0 0 auto',
            color: danger ? palette.danger : (hovered ? palette.text : palette.muted),
            transition: 'color 0.15s ease',
          }}
        >
          {icon}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </span>
      {trailing ? (
        <span
          style={{
            display: 'flex',
            flex: '0 0 auto',
            color: hovered ? (danger ? palette.danger : palette.text) : palette.muted,
          }}
        >
          {trailing}
        </span>
      ) : null}
    </button>
  )
}

function UserIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LogoutIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

/** GEN metric icon (lucide `cpu`, blue like the prototype). */
function CpuIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b82f6"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  )
}

/** ERC metric icon (lucide `waves`, purple like the prototype). */
function WaveIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#a855f7"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M2 12c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0" />
      <path d="M2 17c1.5-3 3-3 4.5 0s3 3 4.5 0 3-3 4.5 0 3 3 4.5 0" />
    </svg>
  )
}

/** Upgrade-button crown (solid amber like the prototype). */
function CrownIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="#fcd34d"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M2 18h20l-1.5-9-5.5 4L12 5.5 9 13l-5.5-4L2 18z" />
    </svg>
  )
}

/** Trailing chevron for nav rows (lucide `chevron-right`). */
function ChevronRightIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

/** AI usage metric glyph (lucide `sparkles`) — the token balance. */
function SparklesIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  )
}

/** Quota-reset metric glyph (lucide `rotate-ccw`) — same size as the AI glyph. */
function ResetIcon(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#3b82f6"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

/** Redemption confirmation glyph (lucide `gift`), tinted with the brand red. */
function GiftIcon({ color }: { color: string }): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flex: '0 0 auto' }}
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </svg>
  )
}

/**
 * One normalized metric reading — everything {@link QuotaMetric} renders.
 *
 * The card itself knows nothing about where a reading comes from, so GEN, ERC
 * and the AI token balance are three small pure adapters over the same
 * presentational component (and each is unit-testable without a DOM).
 */
interface MetricReading {
  /** Right-aligned mono text (already localized and formatted). */
  value: string
  /** Hover detail; defaults to `value`. */
  title?: string
  /** Bar fill, 0–100. Fractional is allowed (sub-1% usage is normal for tokens). */
  percent: number
  /** false → the value renders in the danger color (unsubscribed / no data). */
  ok: boolean
}

/** Quota metric card: icon + label, mono count and a gradient progress bar. */
function QuotaMetric({
  label,
  icon,
  reading,
  gradient,
  palette,
  action,
}: {
  label: string
  icon: React.JSX.Element
  reading: MetricReading | null
  gradient: string
  palette: Palette
  /** Keeps the card on one row: sits next to the count, bar is not drawn. */
  action?: React.ReactNode
}): React.JSX.Element {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const value = reading?.value ?? '—'
  return (
    <div
      role="presentation"
      style={{
        background: hovered ? palette.metricHover : palette.metric,
        borderRadius: 12,
        border: `1px solid ${palette.cardBorder}`,
        padding: 10,
        boxSizing: 'border-box',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: action ? 0 : 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: palette.text, minWidth: 0 }}>
          {icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontWeight: 700,
              color: reading?.ok ? palette.heading : palette.danger,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
            title={reading?.title ?? value}
          >
            {value}
          </span>
          {action}
        </span>
      </div>
      {!action && (
        <div style={{ width: '100%', height: 6, borderRadius: 999, background: palette.track, overflow: 'hidden' }}>
          <div style={{ width: `${reading?.percent ?? 0}%`, height: '100%', borderRadius: 999, background: gradient }} />
        </div>
      )}
    </div>
  )
}

/**
 * GEN / ERC reading from an eda.cn active-subscription payload.
 *
 * `hasSubscription` false (or an unknown total) is NOT an error: it is an
 * account with no plan, which reads as 0% plus the "not subscribed" copy in
 * the danger color.
 */
export function quotaReading(quota: SubscriptionQuota | null, t: Translate): MetricReading | null {
  if (!quota) return null
  const used = quota.currentQuota
  const total = quota.totalQuota
  const percent = quota.hasSubscription && typeof total === 'number' && total > 0
    ? Math.max(0, Math.min(100, Math.round((used / total) * 100)))
    : 0
  const subscribed = quota.hasSubscription
  return {
    // Headline shows the usage percent (e.g. "65%"); the exact
    // "{used} / {total}" count is preserved as the hover title.
    value: subscribed
      ? (typeof total === 'number'
          ? t('subscription.quotaPercent', { percent })
          : `${percent}%`)
      : t('subscription.unsubscribed'),
    title: subscribed && typeof total === 'number'
      ? t('subscription.quotaCount', { used, total })
      : undefined,
    percent,
    ok: subscribed,
  }
}

/**
 * AI reading from the subscription-balances AI Points group.
 *
 * The percentage is the upstream `quotaRemainPercent` — the REMAINING share —
 * passed through unchanged: no local ratio and no re-rounding, so `99.68`
 * renders as `99.68%`. A missing / `null` / non-finite value is unavailable
 * (the card shows「—」); the bar clamps to 0–100 while the label does not.
 */
export function aiUsageReading(usage: AiUsage | null, t: Translate): MetricReading | null {
  const percent = usage?.quotaRemainPercent
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return null
  return {
    value: t('subscription.aiUsagePercent', { percent }),
    percent: Math.max(0, Math.min(100, percent)),
    ok: true,
  }
}

/**
 * Profile header card (prototype): name + plan badge + phone line on the
 * left, an "online" pill on the right. No redundant avatar — the trigger
 * already shows it.
 */
function ProfileHeaderCard({
  displayName,
  packageName,
  phone,
  palette,
}: {
  displayName: string
  packageName: string | null
  phone: string | null
  palette: Palette
}): React.JSX.Element {
  const t = useT()
  return (
    <div
      role="presentation"
      style={{
        padding: 10,
        borderRadius: 12,
        background: palette.card,
        border: `1px solid ${palette.headerBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 12,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: palette.heading,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </span>
          {packageName ? (
            <span
              style={{
                fontSize: 10,
                background: palette.badgeBg,
                color: palette.badgeText,
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 500,
                border: `1px solid ${palette.badgeBorder}`,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {packageName}
            </span>
          ) : null}
        </div>
        {phone ? (
          <p
            style={{
              margin: 0,
              marginTop: 2,
              fontSize: 12,
              color: palette.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {phone}
          </p>
        ) : null}
      </div>
      <span
        style={{
          fontSize: 10,
          background: palette.onlineBg,
          color: palette.online,
          padding: '2px 8px',
          borderRadius: 999,
          fontWeight: 500,
          border: `1px solid ${palette.onlineBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 6, background: palette.online }} />
        {t('subscription.online')}
      </span>
    </div>
  )
}

/** Full-width red-gradient upgrade button (prototype CTA). */
function UpgradeButton({
  subscribing,
  palette,
  onClick,
}: {
  subscribing: boolean
  palette: Palette
  onClick: () => void
}): React.JSX.Element {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      style={{
        width: '100%',
        marginTop: 10,
        padding: '9px 12px',
        borderRadius: 12,
        border: 'none',
        background: hovered && !subscribing
          ? `linear-gradient(90deg, ${palette.primaryHover}, ${palette.ctaHoverEnd})`
          : `linear-gradient(90deg, ${palette.primary}, ${palette.ctaEnd})`,
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: subscribing ? 'default' : 'pointer',
        opacity: subscribing ? 0.72 : 1,
        boxShadow: palette.ctaShadow,
        transition: 'background 0.15s ease, opacity 0.15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <CrownIcon />
      {subscribing ? t('subscription.subscribing') : t('subscription.upgrade')}
    </button>
  )
}

export const HuaqiuAuthSidebarAction = memo(function HuaqiuAuthSidebarAction({ wide }: SidebarFooterActionOwnerProps): React.JSX.Element | null {
  const authState = useSyncExternalStore(subscribeAuth, getAuthState)
  const auth = getAuth()
  const dark = useIsDark()
  const locale = useLocale()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [quota, setQuota] = useState<{ gen: SubscriptionQuota | null; erc: SubscriptionQuota | null; ai: AiUsage | null } | null>(null)
  const [subscribing, setSubscribing] = useState(false)
  // Quota-reset grants: a metric card, with a styled body-level dialog owning
  // the confirmation copy. No prompt/failure text is rendered inside the menu.
  const [resetGrants, setResetGrants] = useState<ResetGrantsView | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  // Avatar reminder: only the bubble's × acknowledges it, never the menu.
  const [resetReminder, setResetReminder] = useState(false)
  const [reminderStyle, setReminderStyle] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const confirmRef = useRef<HTMLDivElement | null>(null)

  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE
  const authenticated = authState.authenticated
  const showLabel = wide !== false

  // Hide the trigger only when an HQ Edge host that ALREADY exposes its own
  // login surface is present: hq-eda has a native login button + status badge,
  // so this entrypoint would be redundant there. Every other configuration
  // (standalone DSH, kicad/generic hosts) has no login entrypoint of its own,
  // so the sidebar trigger is the only way in and must render.
  const hostMode = auth?.isHostMode?.() ?? false
  const targetHost = hostMode ? (getHqEdge()?.context?.getTargetHost?.() ?? '') : ''
  if (hostMode && targetHost === 'hq-eda') return null

  // Host sessions (kicad/generic) carry only {token, userId} — no nickname,
  // no avatar. Fetch the rich eda.cn profile (name + photo) so the trigger
  // renders the real account instead of a bare HQ icon. Standalone DSH already
  // has both from the auth.eda.cn payload, so this is host-only.
  const profile = authState.profile
  useEffect(() => {
    if (!hostMode || targetHost === 'hq-eda') return
    if (!authenticated) {
      setProfile(null)
      return
    }
    let cancelled = false
    auth?.getUserProfile?.()
      .then((info) => {
        if (cancelled) return
        setProfile(info)
      })
      .catch(() => { /* UI degrades to the HQ icon */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostMode, targetHost, authenticated])

  const displayName = profile?.nickname ?? authState.nickname
  const displayAvatar = profile?.headimage ?? authState.avatar
  const avatar = authenticated && !avatarBroken ? displayAvatar : undefined

  // A new avatar URL is a fresh chance to render it.
  useEffect(() => {
    setAvatarBroken(false)
  }, [displayAvatar])

  // Logging out (from anywhere: menu, another tab surface, node invalidation)
  // must never leave an orphan menu pointing at a signed-out account.
  useEffect(() => {
    if (!authenticated) {
      setMenuOpen(false)
      setResetDialogOpen(false)
    }
  }, [authenticated])

  // Live quota: EVERY time the menu opens (and every time the auth state
  // flips to authenticated) re-fetch the active subscription for GEN and ERC
  // from the environment's subscription API, and the AI percentage from the
  // node-proxied subscription balances. All three share one loading window
  // instead of three staggered ones. Reset grants are NOT read here: they come
  // from the session-start fetch below and the card uses that cached count.
  useEffect(() => {
    if (!menuOpen || !authenticated) {
      if (!menuOpen) {
        setQuota(null)
        setResetBusy(false)
      }
      return
    }
    let cancelled = false
    void Promise.all([
      auth?.getSubscriptionQuota?.(GEN_PRODUCT_CODE).catch(() => null) ?? Promise.resolve(null),
      auth?.getSubscriptionQuota?.(ERC_PRODUCT_CODE).catch(() => null) ?? Promise.resolve(null),
      auth?.getAiTokenUsage?.().catch(() => null) ?? Promise.resolve(null),
    ]).then(([gen, erc, ai]) => {
      if (!cancelled) setQuota({ gen, erc, ai })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, authenticated])

  // Reset grants are read ONCE when a signed-in session appears — right after
  // login, or on entering DSH already signed in. A count above the last
  // acknowledged local baseline (or no baseline at all) raises the avatar
  // reminder. Only the bubble's × writes the baseline back.
  useEffect(() => {
    if (!authenticated) {
      setResetGrants(null)
      setResetReminder(false)
      return
    }
    let cancelled = false
    const authClient = auth
    // Older harnesses / test stubs may not expose this seam.
    if (!authClient || typeof authClient.getResetGrants !== 'function') return
    void (async () => {
      try {
        const grants = await authClient.getResetGrants()
        if (cancelled) return
        setResetGrants(grants ?? null)
        if (!grants) return
        const record = readResetGrantRecord()
        if (record === null || record.count < grants.count) setResetReminder(true)
      } catch {
        if (!cancelled) setResetGrants(null)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  // Anchor the portalled menu to the trigger before paint: the sidebar footer
  // sits at the bottom edge, so the menu grows UPWARD from the trigger's top.
  // Width is FIXED (320, prototype `w-80`) — the sidebar footer is narrow, so
  // the popup intentionally overhangs it instead of collapsing to its width.
  useLayoutEffect(() => {
    if (!menuOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setMenuStyle({
      ...MENU_BASE,
      background: palette.surface,
      borderColor: palette.border,
      color: palette.text,
      boxShadow: palette.shadow,
      left: Math.max(8, Math.round(rect.left)),
      bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 8)),
    })
  }, [menuOpen, avatar, palette])

  // Sit the reminder directly ABOVE the avatar, with a small arrow pointing
  // down at it. Portalled to <body> because the sidebar footer clips overflow.
  // The menu grows upward from the same edge, so the bubble yields to it while
  // open — the unread state is untouched, only × acknowledges it.
  useLayoutEffect(() => {
    if (!resetReminder || !authenticated || !triggerRef.current) {
      setReminderStyle(null)
      return
    }
    const place = (): void => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setReminderStyle({
        ...REMINDER_BASE,
        left: Math.max(8, Math.round(rect.left) + 4),
        bottom: Math.max(8, Math.round(window.innerHeight - rect.top + 10)),
        background: palette.surface,
        borderColor: palette.border,
        color: palette.text,
        boxShadow: palette.shadow,
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('resize', place) }
  }, [resetReminder, authenticated, avatar, palette])

  // Close on: outside click, Escape, resize or scroll (the anchor moved).
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      // The redemption dialog sits above the menu; interacting with it must
      // not dismiss the menu underneath.
      if (confirmRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (resetDialogOpen) return
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const dismiss = (): void => setMenuOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [menuOpen, resetDialogOpen])

  // Escape dismisses the confirmation without redeeming anything.
  useEffect(() => {
    if (!resetDialogOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setResetDialogOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [resetDialogOpen])

  if (!auth) return null

  /**
   *「Go to profile」always carries the token, so eda.cn can establish the
   * session in the opened tab (it hides the token itself — see
   * `lib.ts#buildProfileUrl`). The snapshot normally has it; fall back to the
   * client so a stale snapshot can never open an unauthenticated tab.
   */
  const openProfile = (): void => {
    setMenuOpen(false)
    void (async () => {
      const info = authState.token
        ? { token: authState.token, phone: authState.phone }
        : await auth.getUserInfo()
            .then((i) => (i ? { token: i.token, phone: i.phone } : null))
            .catch(() => null)
      if (!info?.token) return
      // `profileUrl` is the HQ Edge-resolved full URL (`HQ_AI_ENV`); null in
      // standalone, where buildProfileUrl keeps its PROD fallback.
      const profileUrl = auth.getProfileUrl()
      window.open(
        buildProfileUrl({ ...info, ...(profileUrl ? { profileUrl } : {}) }),
        '_blank',
        'noopener,noreferrer',
      )
    })()
  }

  const label = authenticated
    ? (displayName ?? t('sidebar.account'))
    : t('sidebar.login')

  const title = authenticated ? t('sidebar.accountTitle') : t('sidebar.loginTitle')
  const triggerBackground = menuOpen || hovered ? palette.hover : 'transparent'

  /**
   * Open the subscription page. Host mode → the EDA host's native dialog
   * (DialogService.OpenUrl, preferred size 1400×740); standalone DSH → the
   * in-app iframe dialog at the same preferred size. No credential → no-op.
   */
  const openSubscription = (): void => {
    if (subscribing) return
    setSubscribing(true)
    void auth.openSubscriptionDialog()
      .catch(() => { /* host without dialog service — menu stays usable */ })
      .finally(() => setSubscribing(false))
  }

  /**
   * Consume one pending reset grant, then ALWAYS re-read the count: the
   * upstream may have consumed the grant even when the response was lost, and
   * a stale count would invite a second click on an already-used id.
   * Confirmation lives in a styled body-level dialog — the menu itself never
   * renders a prompt, a failure hint or a busy label.
   */
  const useResetGrant = async (): Promise<void> => {
    const grantId = resetGrants?.pendingGrantId
    if (grantId === null || grantId === undefined || resetBusy) return
    setResetBusy(true)
    try {
      await auth?.useResetGrant?.(grantId)
    } catch {
      // The count is re-read below either way.
    } finally {
      try {
        const fresh = await auth?.getResetGrants?.()
        setResetGrants(fresh ?? null)
        // Keep the acknowledged baseline in step with the redemption. Without
        // this, a later increase would be compared against a stale, higher
        // count and never raise the reminder.
        if (fresh) writeResetGrantRecord(fresh.count)
      } catch {
        setResetGrants(null)
      }
      setResetBusy(false)
    }
  }

  /** × is the only way to acknowledge the avatar reminder. */
  const dismissResetReminder = (): void => {
    if (resetGrants) writeResetGrantRecord(resetGrants.count)
    setResetReminder(false)
  }

  const canUseReset = resetGrants !== null
    && resetGrants.count > 0
    && resetGrants.pendingGrantId !== null
    && !resetBusy

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          if (!authenticated) {
            // Always-transparent embed in the host's language and color scheme;
            // `closeOnOutsideClick` defaults to true. The login dialog owns
            // the DOM (backdrop + card + iframe) and closes itself on
            // backdrop click, Escape, the × button, or the embed's
            // `close_dialog` postMessage.
            //
            // In HOST mode there is no iframe: the promise settles only when
            // the EDA dialog closes, and a dismissal rejects (the host route
            // answers 401 right away instead of holding the connection). That
            // rejection is the normal "user changed their mind" outcome — the
            // entry simply stays on「Login」— so it must not surface as an
            // unhandled rejection.
            void auth
              .login({ lang: locale, theme: dark ? 'dark' : 'light' })
              .catch(() => { /* host dialog dismissed — still signed out */ })
            return
          }
          setMenuOpen((open) => !open)
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...TRIGGER_BASE,
          color: palette.text,
          padding: wide ? '8px 12px' : '8px 6px',
          background: triggerBackground,
        }}
        title={title}
      >
        {avatar ? (
          <span
            style={{
              flex: '0 0 auto',
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: '50%',
              overflow: 'hidden',
              background: palette.avatarBg,
              display: 'block',
            }}
          >
            <img
              src={avatar}
              alt=""
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              onError={() => setAvatarBroken(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </span>
        ) : (
          <HQ_ICON size={ICON_SIZE} />
        )}
        {showLabel ? (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        ) : null}
      </button>

      {resetReminder && authenticated && reminderStyle && !menuOpen
        ? createPortal(
            <div role="status" style={reminderStyle}>
              <ResetIcon />
              <span style={{ flex: '1 1 auto' }}>{t('subscription.resetReminder')}</span>
              <button
                type="button"
                aria-label={t('subscription.resetReminderDismiss')}
                title={t('subscription.resetReminderDismiss')}
                onClick={dismissResetReminder}
                style={{
                  width: 18,
                  height: 18,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: palette.muted,
                  fontFamily: 'inherit',
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -6,
                  left: 20,
                  width: 10,
                  height: 10,
                  background: palette.surface,
                  borderRight: `1px solid ${palette.border}`,
                  borderBottom: `1px solid ${palette.border}`,
                  transform: 'rotate(45deg)',
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {menuOpen && menuStyle
        ? createPortal(
            <div ref={menuRef} role="menu" style={menuStyle}>
              <ProfileHeaderCard
                displayName={displayName ?? t('sidebar.account')}
                packageName={quota?.gen?.packageName ?? quota?.erc?.packageName ?? null}
                phone={authState.phone ?? null}
                palette={palette}
              />
              <div
                role="presentation"
                style={{
                  ...MENU_HEADER_BASE,
                  paddingTop: 0,
                  paddingBottom: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: palette.muted,
                }}
              >
                {t('subscription.quotaHeader')}
              </div>
              <div role="presentation" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <QuotaMetric
                  label={t('subscription.ai')}
                  icon={<SparklesIcon color={palette.aiIcon} />}
                  reading={aiUsageReading(quota?.ai ?? null, t)}
                  gradient={palette.aiGradient}
                  palette={palette}
                />
                <QuotaMetric
                  label={t('subscription.resetLabel')}
                  icon={<ResetIcon />}
                  reading={{
                    value: resetGrants ? t('subscription.resetCount', { count: resetGrants.count }) : '—',
                    percent: 0,
                    ok: resetGrants !== null,
                  }}
                  gradient={palette.aiGradient}
                  palette={palette}
                  action={
                    <button
                      type="button"
                      disabled={!canUseReset}
                      style={resetButtonStyle(palette, !canUseReset)}
                      onClick={() => { setResetDialogOpen(true) }}
                    >
                      {t('subscription.resetUse')}
                    </button>
                  }
                />
              </div>
              <UpgradeButton
                subscribing={subscribing}
                palette={palette}
                onClick={() => {
                  if (subscribing) return
                  openSubscription()
                }}
              />
              <div
                role="presentation"
                style={{
                  height: 1,
                  margin: '12px 2px',
                  background: palette.border,
                }}
              />
              <div role="presentation" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <MenuItem
                  label={t('menu.profile')}
                  icon={<UserIcon />}
                  trailing={<ChevronRightIcon />}
                  palette={palette}
                  onSelect={openProfile}
                />
              </div>
              <div
                role="presentation"
                style={{
                  height: 1,
                  margin: '12px 2px',
                  background: palette.border,
                }}
              />
              <MenuItem
                label={t('menu.logout')}
                icon={<LogoutIcon />}
                danger
                palette={palette}
                onSelect={() => {
                  setMenuOpen(false)
                  // Host mode: a rejected logout request must leave the UI
                  // authenticated — `auth.logout()` only REQUESTS the logout,
                  // the state comes from the host. Swallow the rejection so it
                  // never becomes an unhandled promise error.
                  void auth.logout().catch(() => { /* host refused — stay authenticated */ })
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {resetDialogOpen
        ? createPortal(
            <div
              style={CONFIRM_OVERLAY_BASE}
              onClick={(event) => {
                if (event.target === event.currentTarget) setResetDialogOpen(false)
              }}
            >
              <div
                ref={confirmRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('subscription.resetUse')}
                style={{
                  ...CONFIRM_CARD_BASE,
                  background: palette.surface,
                  borderColor: palette.border,
                  color: palette.text,
                  boxShadow: palette.shadow,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: palette.metric,
                      border: `1px solid ${palette.cardBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <GiftIcon color={palette.primary} />
                  </span>
                  <span style={{ flex: '1 1 auto', paddingTop: 4 }}>
                    {t('subscription.resetConfirm')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={() => { setResetDialogOpen(false) }}
                    style={{
                      padding: '6px 14px',
                      border: `1px solid ${palette.border}`,
                      borderRadius: 8,
                      background: 'transparent',
                      color: palette.text,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      lineHeight: 1.4,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                    }}
                  >
                    {t('subscription.resetCancel')}
                  </button>
                  <button
                    type="button"
                    disabled={resetBusy}
                    style={resetButtonStyle(palette, resetBusy)}
                    onClick={() => {
                      setResetDialogOpen(false)
                      void useResetGrant()
                    }}
                  >
                    {t('subscription.resetConfirmAction')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})
