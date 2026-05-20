import { useMemo } from 'react'
import { FileNode, DependencyEdge } from '@/types/analysis'

export default function CouplingMatrix({ nodes, edges }: { nodes: FileNode[]; edges: DependencyEdge[] }) {
  const topDirs = useMemo(() => {
    const dirs = new Set<string>()
    for (const n of nodes) {
      const parts = n.path.split('/')
      if (parts.length >= 2) dirs.add(parts[0])
      else if (parts.length === 1) dirs.add(parts[0])
    }
    const sorted = [...dirs].sort()
    return sorted.slice(0, 8)
  }, [nodes])

  const matrix = useMemo(() => {
    const m: number[][] = topDirs.map(() => topDirs.map(() => 0))
    for (const e of edges) {
      const si = topDirs.findIndex(d => e.source.startsWith(d + '/') || e.source === d)
      const ti = topDirs.findIndex(d => e.target.startsWith(d + '/') || e.target === d)
      if (si >= 0 && ti >= 0) m[si][ti]++
    }
    return m
  }, [edges, topDirs])

  const maxVal = Math.max(...matrix.flat(), 1)

  if (topDirs.length === 0) return <p className="text-xs text-zinc-400">无足够目录数据</p>

  return (
    <div>
      <div className="text-[10px] text-zinc-400 mb-2">行=导入方, 列=被导入方</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="w-6" />
              {topDirs.map((d, i) => (
                <th key={i} className="px-1 py-0.5 text-zinc-400 font-normal text-left whitespace-nowrap">
                  {d.length > 6 ? d.slice(0, 6) + '..' : d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topDirs.map((d, si) => (
              <tr key={si}>
                <td className="text-zinc-400 text-right pr-1 whitespace-nowrap">
                  {d.length > 6 ? d.slice(0, 6) + '..' : d}
                </td>
                {topDirs.map((_t, ti) => {
                  const v = matrix[si][ti]
                  const intensity = v / maxVal
                  return (
                    <td key={ti} className="px-1 py-1">
                      <div
                        className="h-5 rounded flex items-center justify-center text-[9px]"
                        style={{
                          backgroundColor: intensity > 0.5 ? `rgba(239,68,68,${0.3 + intensity * 0.7})` :
                            intensity > 0.1 ? `rgba(245,158,11,${0.3 + intensity * 0.7})` :
                            v > 0 ? 'rgba(34,197,94,0.2)' : 'transparent',
                          color: intensity > 0.3 ? '#fff' : intensity > 0 ? '#6b7280' : '#d1d5db',
                          minWidth: 28,
                        }}
                      >
                        {v > 0 ? v : ''}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
