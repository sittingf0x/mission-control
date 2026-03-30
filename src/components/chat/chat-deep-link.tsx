'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMissionControl } from '@/store'

/**
 * Applies `/chat?agent=name` or `/chat?sessionKey=...` from the URL once sessions are loaded,
 * then strips query params so the URL is clean.
 */
function ChatDeepLinkInner() {
  const searchParams = useSearchParams()
  const { conversations, setActiveConversation } = useMissionControl()
  const appliedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const agent = searchParams.get('agent')
    const sessionKey = searchParams.get('sessionKey')
    if (!agent && !sessionKey) return
    if (appliedRef.current) return

    const cleanUrl = () => {
      if (typeof window === 'undefined') return
      const u = new URL(window.location.href)
      u.searchParams.delete('agent')
      u.searchParams.delete('sessionKey')
      const qs = u.searchParams.toString()
      window.history.replaceState({}, '', u.pathname + (qs ? `?${qs}` : ''))
    }

    const tryApply = (): boolean => {
      if (cancelled || appliedRef.current) return true
      if (sessionKey) {
        const sk = sessionKey.trim()
        const match = conversations.find(
          (c) => c.session?.sessionKey && c.session.sessionKey === sk,
        )
        if (match) {
          setActiveConversation(match.id)
          appliedRef.current = true
          cleanUrl()
          return true
        }
        return false
      }
      if (agent) {
        const name = agent.trim()
        if (!name) return false
        setActiveConversation(`agent_${name}`)
        appliedRef.current = true
        cleanUrl()
        return true
      }
      return false
    }

    if (tryApply()) return () => {
      cancelled = true
    }

    if (sessionKey) {
      const t = setTimeout(() => {
        if (!cancelled) tryApply()
      }, 400)
      const t2 = setTimeout(() => {
        if (!cancelled) tryApply()
      }, 2200)
      return () => {
        cancelled = true
        clearTimeout(t)
        clearTimeout(t2)
      }
    }

    return () => {
      cancelled = true
    }
  }, [searchParams, conversations, setActiveConversation])

  return null
}

export function ChatDeepLink() {
  return (
    <Suspense fallback={null}>
      <ChatDeepLinkInner />
    </Suspense>
  )
}
