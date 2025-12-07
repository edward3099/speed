'use client'

import { createContext, useContext, ReactNode, useEffect } from 'react'
import { ToastContainer, useToast, Toast } from '@/components/ErrorToast'
import { setGlobalToast } from '@/lib/utils/show-error'

interface ToastContextType {
  showError: (message: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) => string
  showSuccess: (message: string, options?: { duration?: number }) => string
  showWarning: (message: string, options?: { duration?: number }) => string
  showInfo: (message: string, options?: { duration?: number }) => string
  showToast: (message: string, type: 'error' | 'success' | 'info' | 'warning', options?: { duration?: number; action?: { label: string; onClick: () => void } }) => string
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToastContext() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, showError, showSuccess, showWarning, showInfo, dismissToast } = useToast()

  // Set global toast instance for utility functions
  useEffect(() => {
    setGlobalToast({ showError, showSuccess, showWarning, showInfo })
    return () => {
      setGlobalToast(null)
    }
  }, [showError, showSuccess, showWarning, showInfo])

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}
