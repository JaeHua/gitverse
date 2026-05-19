import { FileNode, DependencyEdge } from '@/types/analysis'

interface Props {
  node: FileNode
  edges: DependencyEdge[]
}

export default function FileDetails({ node, edges }: Props) {
  const relatedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  )

  const riskColors = {
    high: 'text-red-500 bg-red-50 dark:bg-red-950',
    medium: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950',
    low: 'text-green-500 bg-green-50 dark:bg-green-950',
  }

  return (
    <div className="p-4">
      <h3 className="font-medium text-sm mb-4 break-all">{node.name}</h3>

      <div className="space-y-3 text-sm">
        <div>
          <span className="text-xs text-zinc-400">路径</span>
          <p className="text-xs mt-0.5 text-zinc-600 dark:text-zinc-300 break-all">{node.path}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">风险等级</span>
          <span className={`text-xs px-2 py-0.5 rounded ${riskColors[node.risk]}`}>
            {node.risk === 'high' ? '高' : node.risk === 'medium' ? '中' : '低'}
          </span>
        </div>

        {node.riskReason && <p className="text-xs text-zinc-500">{node.riskReason}</p>}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold">{node.commitCount}</p>
            <p className="text-[10px] text-zinc-400">修改次数</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-green-500">+{node.addedLines}</p>
            <p className="text-[10px] text-zinc-400">新增行</p>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded p-2">
            <p className="text-lg font-semibold text-red-500">-{node.deletedLines}</p>
            <p className="text-[10px] text-zinc-400">删除行</p>
          </div>
        </div>

        <div>
          <span className="text-xs text-zinc-400">热度</span>
          <div className="mt-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${node.heat}%`,
                backgroundColor:
                  node.heat > 66 ? '#ef4444' : node.heat > 33 ? '#eab308' : '#22c55e',
              }}
            />
          </div>
        </div>

        {relatedEdges.length > 0 && (
          <div>
            <span className="text-xs text-zinc-400">依赖关系 ({relatedEdges.length})</span>
            <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
              {relatedEdges.map((edge, i) => (
                <div
                  key={i}
                  className="text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded px-2 py-1"
                >
                  {edge.source === node.id ? (
                    <>
                      导入 → <span className="text-blue-500">{edge.target.split('/').pop()}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-blue-500">{edge.source.split('/').pop()}</span> → 导入
                    </>
                  )}
                  <span className="ml-2 text-zinc-300">权重 {edge.weight.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
