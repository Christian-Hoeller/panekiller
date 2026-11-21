import type { ResolvedPane, ResolvedWorkspace } from '../config/resolve';
import { planLayout, splitPercent } from '../layout/plan';
import type { Tmux } from './client';
import { exactTarget, LAYOUT_OPTION } from './session';

export type Size = { cols: number; lines: number };

export type Built = {
  /** Pane ids of the apps window, in config order. */
  paneIds: string[];
  editorPaneId?: string;
};

function envArgs(env: Record<string, string>): string[] {
  return Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
}

const PANE_ID = ['-P', '-F', '#{pane_id}'];

function sleep(ms: number): void {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sendCommand(tmux: Tmux, paneId: string, cmd: string | undefined): void {
  if (!cmd) return;
  tmux.exec(['send-keys', '-t', paneId, '-l', cmd]);
  tmux.exec(['send-keys', '-t', paneId, 'Enter']);
}

function split(tmux: Tmux, target: string, dir: '-h' | '-v', remaining: number, pane: ResolvedPane): string {
  return tmux
    .exec([
      'split-window',
      dir,
      '-t',
      target,
      '-l',
      `${splitPercent(remaining)}%`,
      '-c',
      pane.cwd,
      ...envArgs(pane.env),
      ...PANE_ID,
    ])
    .trim();
}

/** Creates the detached session for `ws`: apps window with the auto layout, optional editor window. */
export function buildSession(tmux: Tmux, ws: ResolvedWorkspace, size: Size): Built {
  const columns = planLayout(ws.panes.length, ws.settings.layout);
  const paneIds: string[] = new Array(ws.panes.length);
  const paneAt = (i: number): ResolvedPane => ws.panes[i] as ResolvedPane;
  const firstOf = (c: number): number => columns[c]?.panes[0] ?? 0;

  const first = paneAt(0);
  paneIds[0] = tmux
    .exec([
      'new-session',
      '-d',
      '-s',
      ws.session,
      '-n',
      ws.settings.appsWindowName,
      '-c',
      first.cwd,
      ...envArgs(first.env),
      '-x',
      String(size.cols),
      '-y',
      String(size.lines),
      ...PANE_ID,
    ])
    .trim();
  tmux.exec(['set-option', '-t', exactTarget(ws.session), LAYOUT_OPTION, ws.layoutId]);
  // before splitting, so the title rows are accounted for in the pane sizes
  if (ws.settings.paneTitles) {
    tmux.exec(['set-option', '-w', '-t', paneIds[0] as string, 'pane-border-status', 'top']);
  }

  // Columns: split the rightmost column off the previous one until all exist.
  for (let c = 1; c < columns.length; c++) {
    const idx = firstOf(c);
    paneIds[idx] = split(tmux, paneIds[firstOf(c - 1)] as string, '-h', columns.length - c + 1, paneAt(idx));
  }
  // Rows inside each column, top → bottom.
  for (const col of columns) {
    for (let r = 1; r < col.panes.length; r++) {
      const idx = col.panes[r] as number;
      const above = col.panes[r - 1] as number;
      paneIds[idx] = split(tmux, paneIds[above] as string, '-v', col.panes.length - r + 1, paneAt(idx));
    }
  }

  if (ws.settings.paneTitles) {
    ws.panes.forEach((p, i) => {
      if (p.name) tmux.exec(['select-pane', '-t', paneIds[i] as string, '-T', p.name]);
    });
  }

  let editorPaneId: string | undefined;
  if (ws.editor.enabled) {
    editorPaneId = tmux
      .exec([
        'new-window',
        '-d',
        '-t',
        exactTarget(ws.session),
        '-n',
        ws.editor.windowName,
        '-c',
        ws.root,
        ...envArgs(ws.env),
        ...PANE_ID,
      ])
      .trim();
  }

  sleep(ws.settings.sendDelayMs);
  ws.panes.forEach((p, i) => {
    sendCommand(tmux, paneIds[i] as string, p.cmd);
  });
  if (editorPaneId) sendCommand(tmux, editorPaneId, ws.editor.cmd);

  const focusPane = ws.settings.focus === 'editor' && editorPaneId ? editorPaneId : (paneIds[0] as string);
  tmux.exec(['select-pane', '-t', paneIds[0] as string]);
  tmux.exec(['select-window', '-t', focusPane]);

  return { paneIds, ...(editorPaneId && { editorPaneId }) };
}
