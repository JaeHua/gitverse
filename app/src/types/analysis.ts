export interface GitAnalysis {
  projectId: string
  repoName: string
  totalCommits: number
  totalFiles: number
  analyzedAt: string
  nodes: FileNode[]
  edges: DependencyEdge[]
  commits: CommitSnapshot[]
  fileTimeline: Record<string, FileTimelineEvent[]>
}

export interface FileTimelineEvent {
  date: string
  type: 'added' | 'modified' | 'deleted'
}

export interface FileNode {
  id: string
  path: string
  name: string
  extension: string
  commitCount: number
  addedLines: number
  deletedLines: number
  heat: number
  risk: 'high' | 'medium' | 'low'
  riskReason?: string
}

export interface DependencyEdge {
  source: string
  target: string
  weight: number
  type: 'direct'
}

export interface CommitSnapshot {
  hash: string
  date: string
  message: string
  filesChanged: string[]
  changeType: 'added' | 'modified' | 'deleted'
}

export type RepoSource =
  | { type: 'local'; path: string }
  | { type: 'remote'; url: string }

export interface AnalyzeRequest {
  repoSource: RepoSource
  excludePatterns?: string[]
  maxCommits?: number
}

export interface ProjectSummary {
  id: string
  name: string
  sourceType: 'local' | 'remote'
  sourceInfo: string
  lastAnalyzedAt: string
  latestAnalysisId: string
  fileCount: number
  commitCount: number
  highRiskCount: number
}
