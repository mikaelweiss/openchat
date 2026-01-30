import { X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import { useState, useEffect } from 'react'
import clsx from 'clsx'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

const ToastIcon = ({ type }: { type: Toast['type'] }) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-5 w-5 text-green-500" />
    case 'error':
      return <XCircle className="h-5 w-5 text-red-500" />
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />
    case 'info':
      return <Info className="h-5 w-5 text-blue-500" />
  }
}

const ToastItem = ({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) => {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(() => onRemove(toast.id), 300) // Wait for animation
      }, toast.duration)

      return () => clearTimeout(timer)
    }
  }, [toast.duration, toast.id, onRemove])

  const handleRemove = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(toast.id), 300)
  }

  return (
    <div
      className={clsx(
        'pointer-events-auto w-full max-w-md min-w-[280px] overflow-hidden rounded-lg bg-background shadow-lg ring-1 ring-border border',
        'transform transition-all duration-300 ease-in-out',
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ToastIcon type={toast.type} />
          </div>
          <div className="ml-3 flex-1 pt-0.5 min-w-0">
            <p className="text-sm font-medium text-foreground break-words">{toast.title}</p>
            {toast.message && (
              <p className="mt-1 text-sm text-muted-foreground break-words">{toast.message}</p>
            )}
          </div>
          <div className="ml-4 flex flex-shrink-0">
            <button
              className="inline-flex rounded-md bg-background text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              onClick={handleRemove}
            >
              <span className="sr-only">Close</span>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface ToastContainerProps {
  mobile?: boolean
}

export default function ToastContainer({ mobile = false }: ToastContainerProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [bottomOffset, setBottomOffset] = useState<number | null>(null)

  useEffect(() => {
    if (!mobile) return

    const initialHeight = window.visualViewport?.height ?? window.innerHeight

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const keyboardHeight = initialHeight - window.visualViewport.height
        const isKeyboardOpen = keyboardHeight > 100
        if (isKeyboardOpen) {
          setBottomOffset(keyboardHeight + 80)
        } else {
          setBottomOffset(null)
        }
      }
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize)
      return () => window.visualViewport?.removeEventListener('resize', handleViewportResize)
    }
  }, [mobile])

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const newToast: Toast = {
      ...toast,
      id: Math.random().toString(36).substr(2, 9),
      duration: toast.duration || 5000
    }
    setToasts(prev => [...prev, newToast])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Expose methods globally for easy use (in a real app, you'd use a proper store)
  useEffect(() => {
    // @ts-ignore - Adding to window for easy access in console
    window.showToast = addToast
  }, [])

  return (
    <div
      aria-live="assertive"
      className={clsx(
        'pointer-events-none fixed flex flex-col space-y-4 z-50',
        mobile
          ? 'left-4 right-4 items-center'
          : 'bottom-0 right-0 items-end px-4 py-6'
      )}
      style={mobile ? { bottom: bottomOffset ?? 96 } : undefined}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

// Export the types for external use
export type { Toast }