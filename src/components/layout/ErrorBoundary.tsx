import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// --- Error Boundary ---
// React error boundary that catches render errors in child components
// and displays a graceful fallback instead of crashing the entire app.

interface ErrorBoundaryProps {
  children: ReactNode
  panelName?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[${this.props.panelName || 'Panel'}] Error caught by boundary:`,
      error,
      errorInfo.componentStack
    )
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-xs">
            <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            </div>
            <h3 className="text-sm font-medium text-c-text">
              {this.props.panelName || 'Panel'} Error
            </h3>
            <p className="text-xs text-c-muted leading-relaxed">
              {this.state.error?.message || 'Something went wrong in this panel.'}
            </p>
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-mothership-600 text-white rounded-lg hover:bg-mothership-500 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
