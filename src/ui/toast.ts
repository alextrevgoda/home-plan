import { create } from 'zustand'

interface ToastState {
  message: string | null
  show: (message: string) => void
  clear: () => void
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    set({ message })
    setTimeout(() => set({ message: null }), 5000)
  },
  clear: () => set({ message: null }),
}))
