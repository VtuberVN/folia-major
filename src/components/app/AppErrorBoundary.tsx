import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[AppErrorBoundary] Uncaught React error:', error, errorInfo);
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="fixed inset-0 z-[9990] flex flex-col items-center justify-center p-6 bg-black/85 text-white backdrop-blur-md">
                    <div className="flex flex-col items-center max-w-md text-center p-6 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-2xl">
                        <div className="p-3 mb-4 rounded-full bg-red-500/20 text-red-400">
                            <AlertCircle size={36} />
                        </div>
                        <h2 className="text-lg font-semibold mb-2">Đã xảy ra sự cố hiển thị</h2>
                        <p className="text-xs text-zinc-400 mb-4 line-clamp-3 font-mono">
                            {this.state.error?.message || 'Lỗi giao diện không xác định'}
                        </p>
                        <div className="flex items-center gap-3 w-full">
                            <button
                                type="button"
                                onClick={this.handleReset}
                                className="flex-1 px-4 py-2 text-xs font-medium rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
                            >
                                Thử lại
                            </button>
                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-white text-black hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <RefreshCw size={14} />
                                Tải lại ứng dụng
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default AppErrorBoundary;
