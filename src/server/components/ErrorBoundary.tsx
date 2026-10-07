import { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { BTN_PRIMARY, BTN_SECONDARY } from './settingsUi';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

// Used at the root of both apps (server and client kiosk) and around Pengaturan.
export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI component:', error, errorInfo);
  }

  private retry = () => this.setState({ error: null });
  private reload = () => window.location.reload();

  public render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="w-full h-full min-h-[240px] flex items-center justify-center p-6 bg-canvas">
        <div className="w-full max-w-[440px] bg-surface-2 border border-hairline border-l-4 border-l-error rounded-md p-4">
          <h2 className="text-[15px] font-semibold text-text-primary">{this.props.fallbackTitle || 'Tampilan ini bermasalah'}</h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            Data billing tidak ikut hilang. Coba tampilkan lagi, atau muat ulang aplikasi kalau masih gagal.
          </p>
          <p className="mt-3 px-2.5 py-2 rounded-sm bg-surface-1 border border-hairline font-mono text-[11px] text-text-muted break-words max-h-24 overflow-y-auto">
            {this.state.error.message || 'Error tidak diketahui'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={this.reload} className={BTN_SECONDARY}>Muat ulang aplikasi</button>
            <button type="button" onClick={this.retry} className={BTN_PRIMARY} autoFocus>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  }
}
