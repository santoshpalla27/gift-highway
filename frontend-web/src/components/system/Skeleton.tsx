const shimmerStyle = `
  @keyframes _skshimmer {
    0%   { background-position: -200% 0 }
    100% { background-position:  200% 0 }
  }
  ._sk {
    background: linear-gradient(90deg, #F3F4F6 25%, #E9EAEC 50%, #F3F4F6 75%);
    background-size: 200% 100%;
    animation: _skshimmer 1.4s infinite;
    border-radius: 6px;
  }
`

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }: SkeletonProps) {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="_sk" style={{ width, height, borderRadius, flexShrink: 0, ...style }} />
    </>
  )
}

interface TableSkeletonProps {
  rows?: number
  cols?: number
}

export function TableSkeleton({ rows = 6, cols = 7 }: TableSkeletonProps) {
  const widths = ['60px', '110px', '180px', '90px', '100px', '80px', '70px']

  return (
    <>
      <style>{shimmerStyle}</style>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} style={{ borderBottom: '1px solid #E4E6EF', background: '#FFFFFF' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} style={{ padding: '14px 16px' }}>
              <div
                className="_sk"
                style={{
                  height: 14,
                  width: widths[c] ?? '100px',
                  borderRadius: 6,
                  opacity: 0.7 + r * 0.04,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

interface CardSkeletonProps {
  count?: number
}

export function CardSkeleton({ count = 5 }: CardSkeletonProps) {
  return (
    <>
      <style>{shimmerStyle}</style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: '#FFFFFF', border: '1px solid #E4E6EF',
          borderRadius: 12, padding: '14px 16px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="_sk" style={{ height: 14, width: 80, borderRadius: 6 }} />
            <div className="_sk" style={{ height: 22, width: 72, borderRadius: 999 }} />
          </div>
          <div className="_sk" style={{ height: 14, width: '60%', borderRadius: 6, marginBottom: 8 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <div className="_sk" style={{ height: 12, width: 90, borderRadius: 6 }} />
            <div className="_sk" style={{ height: 12, width: 70, borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </>
  )
}
