import { useCallback, useRef, useState } from 'react'
import { classifyAiError } from '../services/ai-error'

// ---------------------------------------------------------------------------
// State machine for AI-driven operations (generation, evaluation, submission)
//
//   idle ─► submitting ─► processing ─► completed
//                │                  └──► failed
//                │                  └──► cancelled
//                └──────────────────────► failed
//
// 'submitting'  — request sent, server has not begun long work yet
// 'processing'  — still running after processingAfterMs; show a richer
//                 "working…" indicator to the user
// 'completed'   — resolved successfully; result is available
// 'failed'      — rejected; error message is available
// 'cancelled'   — aborted (ApiError code 'cancelled'); show nothing
// ---------------------------------------------------------------------------

export type AiStatus = 'idle' | 'submitting' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type AiOperationState<T> = {
  status: AiStatus
  result: T | undefined
  /** User-safe error message, empty when status is not 'failed' */
  error: string
  /** True when the operation can be retried (rate limits, timeouts, server errors) */
  retryable: boolean
  /**
   * Date.now() epoch after which a retry is allowed, or 0 if immediately.
   * Non-zero only after a rate-limited (HTTP 429) failure.
   */
  retryAfterEpoch: number
}

export type UseAiOperationOptions = {
  /**
   * Milliseconds after which a still-running operation transitions from
   * 'submitting' to 'processing'. Defaults to 3 000 ms.
   */
  processingAfterMs?: number
}

function initialState<T>(): AiOperationState<T> {
  return { status: 'idle', result: undefined, error: '', retryable: false, retryAfterEpoch: 0 }
}

export function useAiOperation<T = void>(opts?: UseAiOperationOptions) {
  const processingAfterMs = opts?.processingAfterMs ?? 3_000

  const [state, setState] = useState<AiOperationState<T>>(initialState<T>)

  // runGeneration tracks which invocation is live; stale async results are
  // ignored, so React never receives a setState from an unmounted component
  // or from a superseded run.
  const runGen = useRef(0)

  /**
   * Execute an AI operation.
   *
   * - Silently returns undefined if already running (duplicate-submit guard).
   * - Transitions through submitting → processing → completed/failed.
   * - Classifies any thrown error into a safe user message.
   * - Preserves 'cancelled' state without showing it as an error.
   */
  const run = useCallback(
    async (fn: () => Promise<T>): Promise<T | undefined> => {
      // Duplicate-submit guard
      if (state.status === 'submitting' || state.status === 'processing') return undefined

      const id = ++runGen.current
      setState({ status: 'submitting', result: undefined, error: '', retryable: false, retryAfterEpoch: 0 })

      // Promote to 'processing' if the fn hasn't resolved quickly
      const timer = window.setTimeout(() => {
        if (runGen.current === id) {
          setState((s) =>
            s.status === 'submitting' ? { ...s, status: 'processing' } : s,
          )
        }
      }, processingAfterMs)

      try {
        const result = await fn()
        window.clearTimeout(timer)
        if (runGen.current !== id) return undefined
        setState({ status: 'completed', result, error: '', retryable: false, retryAfterEpoch: 0 })
        return result
      } catch (error) {
        window.clearTimeout(timer)
        if (runGen.current !== id) return undefined

        const info = classifyAiError(error)

        if (info.code === 'cancelled') {
          setState((s) => ({ ...s, status: 'cancelled', error: '' }))
          return undefined
        }

        setState({
          status: 'failed',
          result: undefined,
          error: info.userMessage,
          retryable: info.retryable,
          retryAfterEpoch: info.retryAfterMs > 0 ? Date.now() + info.retryAfterMs : 0,
        })
        return undefined
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.status, processingAfterMs],
  )

  /** Reset to idle, discarding any result or error. Cancels any in-flight run. */
  const reset = useCallback(() => {
    runGen.current++ // invalidate any in-flight run
    setState(initialState<T>())
  }, [])

  const busy = state.status === 'submitting' || state.status === 'processing'

  return { state, run, reset, busy }
}
