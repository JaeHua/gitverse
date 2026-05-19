import fs from 'fs'
import path from 'path'
import ts from 'typescript'
import { DependencyEdge } from '@/types/analysis'

function resolveImportPath(
  importPath: string,
  currentFile: string,
  repoDir: string
): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null
  }

  const baseDir = path.dirname(currentFile)
  const resolved = path.resolve(baseDir, importPath)

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return path.relative(repoDir, resolved)
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
  for (const ext of extensions) {
    const withExt = resolved + ext
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return path.relative(repoDir, withExt)
    }
  }

  return null
}

function parseImportsInFile(
  filePath: string,
  repoDir: string
): Array<{ source: string; target: string }> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  )

  const relativePath = path.relative(repoDir, filePath)
  const imports: Array<{ source: string; target: string }> = []

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const importPath = node.moduleSpecifier.text
      const resolved = resolveImportPath(importPath, filePath, repoDir)
      if (resolved) {
        imports.push({ source: relativePath, target: resolved })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return imports
}

export function analyzeImports(
  sourceFiles: string[],
  repoDir: string,
  existingNodes: Set<string>
): DependencyEdge[] {
  const importMap = new Map<string, Map<string, number>>()

  for (const filePath of sourceFiles) {
    const absPath = path.resolve(repoDir, filePath)
    if (!fs.existsSync(absPath)) continue

    try {
      const imports = parseImportsInFile(absPath, repoDir)
      for (const { source, target } of imports) {
        if (!existingNodes.has(source) || !existingNodes.has(target)) continue
        if (source === target) continue

        if (!importMap.has(source)) {
          importMap.set(source, new Map())
        }
        const targetMap = importMap.get(source)!
        targetMap.set(target, (targetMap.get(target) || 0) + 1)
      }
    } catch {
      // skip files that can't be parsed
    }
  }

  const edges: DependencyEdge[] = []
  for (const [source, targets] of importMap) {
    for (const [target, callCount] of targets) {
      const weight = Math.min(
        100,
        Math.log2(callCount + 1) * 20 + Math.min(60, callCount * 5)
      )
      edges.push({
        source,
        target,
        weight: Math.round(weight * 100) / 100,
        type: 'direct',
      })
    }
  }

  return edges
}
