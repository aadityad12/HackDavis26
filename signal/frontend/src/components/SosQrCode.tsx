import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  resetKey?: number
}

export default function SosQrCode({ resetKey = 0 }: Props) {
  const [host, setHost] = useState<string>(window.location.hostname)

  useEffect(() => {
    fetch('/api/ip')
      .then((r) => r.json())
      .then((d) => { if (d.ip) setHost(d.ip) })
      .catch(() => {})
  }, [resetKey])

  const { port, protocol } = window.location
  const url = `${protocol}//${host}${port ? `:${port}` : ''}/sos`

  return (
    <div style={{
      position: 'fixed',
      top: 56,
      right: 12,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      padding: '10px 12px',
      background: '#111827',
      border: '1px solid rgba(239,68,68,0.5)',
      borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    }}>
      <QRCodeSVG
        value={url}
        size={96}
        bgColor="#111827"
        fgColor="#f9fafb"
        level="M"
      />
      <span style={{ fontSize: 10, color: '#ef4444', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
        Scan to report emergency
      </span>
    </div>
  )
}
