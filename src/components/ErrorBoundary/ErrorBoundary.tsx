import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  /** Named in the fallback copy, e.g. "the gallery". */
  readonly area: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

/**
 * Stops a rendering fault in one area of the application from blanking the
 * whole page. Technical detail is shown only in development; users get a
 * recovery route instead of a stack trace.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error(`[${this.props.area}] render failed`, error, info.componentStack);
    }
  }

  private readonly handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className={styles.boundary} role="alert">
        <h2 className={styles.heading}>Something went wrong in {this.props.area}.</h2>
        <p className={styles.body}>
          This is a fault in APL Art rather than in your APL code. You can try again, or return to the
          gallery.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={this.handleRetry}>
            Try again
          </button>
          <a className={styles.link} href="#/">
            Back to the gallery
          </a>
        </div>
        {import.meta.env.DEV && (
          <details className={styles.details}>
            <summary>Developer details</summary>
            <pre className={styles.pre}>{error.stack ?? error.message}</pre>
          </details>
        )}
      </div>
    );
  }
}
