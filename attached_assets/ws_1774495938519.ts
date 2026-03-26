const WS_BASE = (process.env.NEXT_PUBLIC_API_URL || '')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://')

export function connectSignalFeed(
  assetId: string,
  onSignal: (data: any) => void,
  onError?: (e: Event) => void
): () => void {
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function connect() {
    if (destroyed) return
    try {
      ws = new WebSocket(`${WS_BASE}/ws/signals/${assetId}`)

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type !== 'ping') onSignal(data)
        } catch {}
      }

      ws.onerror = (e) => {
        onError?.(e)
      }

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }
    } catch (e) {
      if (!destroyed) {
        reconnectTimer = setTimeout(connect, 5000)
      }
    }
  }

  connect()

  // Cleanup function
  return () => {
    destroyed = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) ws.close()
  }
}
