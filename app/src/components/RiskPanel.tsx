import { FileNode } from '@/types/analysis'

interface Props {
  nodes: FileNode[]
  onNodeSelect: (id: string) => void
}

export default function RiskPanel({ nodes, onNodeSelect }: Props) {
  const sorted = [...nodes]
    .filter((n) => n.risk === 'high' || n.risk === 'medium')
    .sort((a, b) => b.heat - a.heat)

  const riskCounts = {
    high: nodes.filter((n) => n.risk === 'high').length,
    medium: nodes.filter((n) => n.risk === 'medium').length,
    low: nodes.filter((n) => n.risk === 'low').length,
  }

  return (
    <div className="p-4">
      <h3 className="font-medium text-sm mb-4">风险热点</h3>

      <div className="flex gap-3 mb-4 text-center text-xs">
        <div className="flex-1 bg-red-50 dark:bg-red-950 rounded p-2">
          <p className="text-red-500 font-semibold">{riskCounts.high}</p>
          <p className="text-zinc-400">高风险</p>
        </div>
        <div className="flex-1 bg-yellow-50 dark:bg-yellow-950 rounded p-2">
          <p className="text-yellow-500 font-semibold">{riskCounts.medium}</p>
          <p className="text-zinc-400">中风险</p>
        </div>
        <div className="flex-1 bg-green-50 dark:bg-green-950 rounded p-2">
          <p className="text-green-500 font-semibold">{riskCounts.low}</p>
          <p className="text-zinc-400">低风险</p>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-400">暂无高风险文件</p>
      ) : (
        <div className="space-y-1">
          {sorted.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeSelect(node.id)}
              className="w-full text-left px-3 py-2 rounded text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <p className="font-medium truncate">{node.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={node.risk === 'high' ? 'text-red-500' : 'text-yellow-500'}
                >
                  {node.risk === 'high' ? '高' : '中'}
                </span>
                <span className="text-zinc-400">{node.commitCount} 次修改</span>
                <span className="text-zinc-300">|</span>
                <span className="text-zinc-400">热度 {node.heat}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
