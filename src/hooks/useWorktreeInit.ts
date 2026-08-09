import { useEffect } from 'react'

export interface ProjectGitInfo {
  rootPath: string
  currentBranch: string
  hasRemotes: boolean
  remoteName: string | null
  hasUncommitted: boolean
}

/**
 * On mount, detect the git project at the current working directory and
 * automatically list any existing worktree workspaces.
 *
 * @param detectProject  Store function that probes for a git repo.
 * @param listWorktrees  Store function that fetches worktrees for a root path.
 */
export function useWorktreeInit(
  detectProject: (path?: string) => Promise<ProjectGitInfo | null>,
  listWorktrees: (projectPath: string) => Promise<void>,
): void {
  useEffect(() => {
    const init = async () => {
      const info = await detectProject('.')
      if (info) {
        await listWorktrees(info.rootPath)
      }
    }
    init()
  }, [detectProject, listWorktrees])
}
