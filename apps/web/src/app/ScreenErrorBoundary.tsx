import { Component, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router';

import { captureError } from '../features/bug-report';

type BoundaryProps = {
  children: ReactNode;
  context: { route: string; gameId?: string };
};

type BoundaryState = { crashed: boolean };

export function ScreenErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const params = useParams();
  const spotlight = new URLSearchParams(location.search).get('spotlight')?.trim();
  const gameId = params.gameId?.trim() || spotlight || undefined;

  return (
    <Boundary key={`${location.pathname}:${gameId ?? ''}`} context={{ route: location.pathname, gameId }}>
      {children}
    </Boundary>
  );
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error): void {
    captureError(error, this.props.context);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="screen-error" role="alert">
          <button className="tap-primary" type="button" onClick={() => this.setState({ crashed: false })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
