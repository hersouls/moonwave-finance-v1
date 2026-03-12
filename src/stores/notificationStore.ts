import { create } from 'zustand'
import { db } from '@/services/database'

export interface AppNotification {
  id?: number
  type: 'budget_exceeded' | 'subscription_billing' | 'goal_achieved' | 'sync_error' | 'info'
  title: string
  body: string
  read: boolean
  createdAt: string
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  loadNotifications: () => Promise<void>
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => Promise<void>
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearAll: () => Promise<void>
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,

  loadNotifications: async () => {
    try {
      const items = await db.table('notifications').reverse().sortBy('createdAt')
      const unread = items.filter((n: AppNotification) => !n.read).length
      set({ notifications: items, unreadCount: unread })
    } catch {
      // Table may not exist yet
    }
  },

  addNotification: async (n) => {
    try {
      const notification: AppNotification = {
        ...n,
        read: false,
        createdAt: new Date().toISOString(),
      }
      await db.table('notifications').add(notification)
      await get().loadNotifications()
    } catch {
      // ignore
    }
  },

  markAsRead: async (id) => {
    try {
      await db.table('notifications').update(id, { read: true })
      await get().loadNotifications()
    } catch {
      // ignore
    }
  },

  markAllAsRead: async () => {
    try {
      await db.table('notifications').toCollection().modify({ read: true })
      await get().loadNotifications()
    } catch {
      // ignore
    }
  },

  clearAll: async () => {
    try {
      await db.table('notifications').clear()
      set({ notifications: [], unreadCount: 0 })
    } catch {
      // ignore
    }
  },
}))
