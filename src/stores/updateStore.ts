import { create } from 'zustand'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export interface UpdateInfo {
  available: boolean
  version?: string
  date?: string
  body?: string
  downloading: boolean
  downloadProgress: number
  error: string | null
}

interface UpdateState {
  update: UpdateInfo
  lastChecked: number | null

  // Actions
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissUpdate: () => void
}

export const useUpdateStore = create<UpdateState>()((set, _get) => ({
  update: {
    available: false,
    downloading: false,
    downloadProgress: 0,
    error: null,
  },
  lastChecked: null,

  checkForUpdates: async () => {
    try {
      set((s) => ({
        update: { ...s.update, error: null },
        lastChecked: Date.now(),
      }))

      const update = await check()

      if (update) {
        set({
          update: {
            available: true,
            version: update.version,
            date: update.date ?? undefined,
            body: update.body ?? undefined,
            downloading: false,
            downloadProgress: 0,
            error: null,
          },
        })
      } else {
        set((s) => ({
          update: {
            ...s.update,
            available: false,
            error: null,
          },
        }))
      }
    } catch (e) {
      console.error('Update check failed:', e)
      set((s) => ({
        update: {
          ...s.update,
          error: e instanceof Error ? e.message : 'Failed to check for updates',
          downloading: false,
        },
      }))
    }
  },

  installUpdate: async () => {
    try {
      const update = await check()
      if (!update) {
        set((s) => ({
          update: { ...s.update, error: 'No update available to install' },
        }))
        return
      }

      set((s) => ({
        update: { ...s.update, downloading: true, downloadProgress: 0 },
      }))

      let downloaded = 0
      let contentLength = 0

      await update.download((event: Record<string, unknown>) => {
        switch (event.event) {
          case 'Started': {
            const data = event.data as { contentLength?: number }
            contentLength = data.contentLength ?? 0
            break
          }
          case 'Progress': {
            const data = event.data as { chunkLength?: number }
            downloaded += data.chunkLength ?? 0
            const progress = contentLength > 0 ? downloaded / contentLength : 0
            set((s) => ({
              update: { ...s.update, downloadProgress: progress },
            }))
            break
          }
          case 'Finished':
            set((s) => ({
              update: { ...s.update, downloadProgress: 1 },
            }))
            break
        }
      })

      await update.install()
      await relaunch()
    } catch (e) {
      console.error('Update install failed:', e)
      set((s) => ({
        update: {
          ...s.update,
          downloading: false,
          error: e instanceof Error ? e.message : 'Failed to install update',
        },
      }))
    }
  },

  dismissUpdate: () => {
    set((s) => ({
      update: { ...s.update, available: false },
    }))
  },
}))
