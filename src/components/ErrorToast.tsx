'use client'

import { useEffect, useState } from 'react'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export type ToastType = 'error' | 'success' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ErrorToastProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500" />
    case 'success':
      return <CheckCircle className="w-5 h-5 text-green-500" />
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-amber-500" />
    case 'info':
      return <Info className="w-5 h-5 text-blue-500" />
  }
}

function ToastComponent({ toast, onDismiss }: ErrorToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const duration = toast.duration || 5000
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => onDismiss(toast.id), 300) // Wait for animation
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [toast.id, toast.duration, onDismiss])

  const getBgColor = () => {
    switch (toast.type) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-900'
      case 'success':
        return 'bg-green-50 border-green-200 text-green-900'
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-900'
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-900'
    }
  }

  if (!isVisible) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 p-4 rounded-lg border ${getBgColor()} shadow-lg max-w-md`}
    >
      <ToastIcon type={toast.type} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-semibold underline hover:no-underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => {
          setIsVisible(false)
          setTimeout(() => onDismiss(toast.id), 300)
        }}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastComponent toast={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: ToastType = 'error', options?: {
    duration?: number
    action?: { label: string; onClick: () => void }
  }) => {
    const id = `${Date.now()}-${Math.random()}`
    const newToast: Toast = {
      id,
      message,
      type,
      duration: options?.duration,
      action: options?.action,
    }
    setToasts((prev) => [...prev, newToast])
    return id
  }

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const showError = (message: string, options?: { duration?: number; action?: { label: string; onClick: () => void } }) => {
    return showToast(message, 'error', options)
  }

  const showSuccess = (message: string, options?: { duration?: number }) => {
    return showToast(message, 'success', options)
  }

  const showWarning = (message: string, options?: { duration?: number }) => {
    return showToast(message, 'warning', options)
  }

  const showInfo = (message: string, options?: { duration?: number }) => {
    return showToast(message, 'info', options)
  }

  return {
    toasts,
    showToast,
    showError,
    showSuccess,
    showWarning,
    showInfo,
    dismissToast,
  }
}
