import React from "react";
import { captureException } from "../lib/sentry-client";

interface Props {
  children: React.ReactNode;
  onError?: () => void;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class TurnstileBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: unknown): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, _info: React.ErrorInfo): void {
    captureException(error);
    this.props.onError?.();
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
