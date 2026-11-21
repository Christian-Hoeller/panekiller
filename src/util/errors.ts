export const EXIT_OK = 0;
export const EXIT_USER = 1;
export const EXIT_TMUX = 2;

/** An error meant for the user: printed without a stack trace, exits with `exitCode`. */
export class PkError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_USER) {
    super(message);
    this.name = 'PkError';
    this.exitCode = exitCode;
  }
}

export class TmuxError extends PkError {
  constructor(message: string) {
    super(message, EXIT_TMUX);
    this.name = 'TmuxError';
  }
}
