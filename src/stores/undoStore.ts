import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UndoAction {
  id: string
  type: 'complete' | 'delete' | 'update' | 'batch-complete' | 'batch-delete' | 'reorder'
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
  timestamp: number
}

interface UndoState {
  undoStack: UndoAction[]
  redoStack: UndoAction[]
  currentToast: UndoAction | null
  toastTimeoutId: ReturnType<typeof setTimeout> | null

  pushAction: (action: Omit<UndoAction, 'id' | 'timestamp'>) => void
  undo: () => Promise<void>
  redo: () => Promise<void>
  dismissToast: () => void
}

const MAX_STACK_SIZE = 20
const TOAST_DURATION = 5000

export const useUndoStore = create<UndoState>()(
  devtools(
    (set, get) => ({
      undoStack: [],
      redoStack: [],
      currentToast: null,
      toastTimeoutId: null,

      pushAction: (action) => {
        const fullAction: UndoAction = {
          ...action,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        }

        const prevTimeout = get().toastTimeoutId
        if (prevTimeout) clearTimeout(prevTimeout)

        const timeoutId = setTimeout(() => {
          set({ currentToast: null, toastTimeoutId: null })
        }, TOAST_DURATION)

        set((state) => ({
          undoStack: [...state.undoStack.slice(-(MAX_STACK_SIZE - 1)), fullAction],
          redoStack: [],
          currentToast: fullAction,
          toastTimeoutId: timeoutId,
        }))
      },

      undo: async () => {
        const { undoStack } = get()
        if (undoStack.length === 0) return

        const action = undoStack[undoStack.length - 1]
        await action.undo()

        const prevTimeout = get().toastTimeoutId
        if (prevTimeout) clearTimeout(prevTimeout)

        set((state) => ({
          undoStack: state.undoStack.slice(0, -1),
          redoStack: [...state.redoStack.slice(-(MAX_STACK_SIZE - 1)), action],
          currentToast: null,
          toastTimeoutId: null,
        }))
      },

      redo: async () => {
        const { redoStack } = get()
        if (redoStack.length === 0) return

        const action = redoStack[redoStack.length - 1]
        await action.redo()

        set((state) => ({
          redoStack: state.redoStack.slice(0, -1),
          undoStack: [...state.undoStack.slice(-(MAX_STACK_SIZE - 1)), action],
        }))
      },

      dismissToast: () => {
        const prevTimeout = get().toastTimeoutId
        if (prevTimeout) clearTimeout(prevTimeout)
        set({ currentToast: null, toastTimeoutId: null })
      },
    }),
    { name: 'undo-store' }
  )
)
