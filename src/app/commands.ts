import { Composer } from '../ui/composer';
import { Harvest } from '../ui/harvest';
import { Help } from '../ui/help';
import { JumpHints } from '../ui/jump';
import { LinkMode } from '../ui/linkmode';
import { MapsPanel } from '../ui/maps';
import { MoveMode } from '../ui/movemode';
import { NotesPanel } from '../ui/notes';
import { Palette } from '../ui/palette';
import { Prune } from '../ui/prune';
import { Search } from '../ui/search';
import { SprintSetup, stopSprint } from '../ui/sprint';
import type { App } from './app';

export type Group = 'Move' | 'Grow' | 'Shape' | 'Spark' | 'Judge' | 'View' | 'Maps' | 'App';

export interface Command {
  id: string;
  title: string;
  group: Group;
  keys?: string[];
  run(): void;
  when?(): boolean;
  /** Allow key repeat (holding the key down). */
  repeat?: boolean;
  /** Do not cancel the browser default (paste needs the native event). */
  native?: boolean;
  /** Keep out of the command palette. */
  hidden?: boolean;
  /** Short explanation for the help sheet. */
  hint?: string;
}

export function buildCommands(app: App): Command[] {
  const hasFocus = () => !!app.focus && !!app.doc.nodes[app.focus];
  const cmds: Command[] = [
    // Move
    { id: 'move.up', title: 'Move focus up', group: 'Move', keys: ['arrowup'], run: () => app.move('up'), repeat: true, hidden: true },
    { id: 'move.down', title: 'Move focus down', group: 'Move', keys: ['arrowdown'], run: () => app.move('down'), repeat: true, hidden: true },
    { id: 'move.left', title: 'Move focus left', group: 'Move', keys: ['arrowleft'], run: () => app.move('left'), repeat: true, hidden: true },
    { id: 'move.right', title: 'Move focus right', group: 'Move', keys: ['arrowright'], run: () => app.move('right'), repeat: true, hidden: true },
    { id: 'move.jump', title: 'Jump to any idea', group: 'Move', keys: ['f'], run: () => app.pushLayer(new JumpHints(app)), hint: 'Letters appear on every idea. Type one to fly there.' },
    { id: 'move.search', title: 'Search ideas', group: 'Move', keys: ['/', 'mod+f'], run: () => app.pushLayer(new Search(app)) },
    { id: 'move.center', title: 'Go to this center', group: 'Move', keys: ['home'], run: () => app.focusRoot(0) },
    { id: 'move.prevRoot', title: 'Previous center', group: 'Move', keys: ['['], run: () => app.focusRoot(-1) },
    { id: 'move.nextRoot', title: 'Next center', group: 'Move', keys: [']'], run: () => app.focusRoot(1) },

    // Grow
    { id: 'grow.child', title: 'New branch (child)', group: 'Grow', keys: ['tab'], run: () => app.create('child'), when: hasFocus },
    { id: 'grow.sibling', title: 'New idea below (sibling)', group: 'Grow', keys: ['enter'], run: () => app.create(app.doc.roots.length ? 'sibling' : 'root') },
    { id: 'grow.before', title: 'New idea above', group: 'Grow', keys: ['shift+enter'], run: () => app.create('before'), when: hasFocus },
    { id: 'grow.parent', title: 'Wrap in a new parent', group: 'Grow', keys: ['shift+tab'], run: () => app.create('parent'), when: hasFocus, hint: 'Groups an idea under a new heading.' },
    { id: 'grow.root', title: 'New center', group: 'Grow', keys: ['n'], run: () => app.create('root'), hint: 'Start another central idea on the same map.' },
    { id: 'grow.edit', title: 'Edit idea', group: 'Grow', keys: ['space', 'e', 'f2'], run: () => app.edit(), when: hasFocus },
    {
      id: 'grow.notes',
      title: 'Notes for this idea',
      group: 'Grow',
      keys: ['o'],
      run: () => app.pushLayer(new NotesPanel(app, app.focus!)),
      when: hasFocus,
      hint: 'A scratch pad attached to the idea, for writing more than fits on the map.',
    },
    { id: 'grow.paste', title: 'Paste a list as ideas', group: 'Grow', keys: ['mod+v'], run: () => app.requestPaste(), native: true, hint: 'Indented lists keep their structure.' },

    // Shape
    { id: 'shape.delete', title: 'Delete idea and its branches', group: 'Shape', keys: ['backspace', 'delete'], run: () => app.remove(), when: hasFocus },
    { id: 'shape.moveUp', title: 'Move idea up', group: 'Shape', keys: ['alt+arrowup'], run: () => app.moveNode('up'), when: hasFocus, repeat: true, hidden: true },
    { id: 'shape.moveDown', title: 'Move idea down', group: 'Shape', keys: ['alt+arrowdown'], run: () => app.moveNode('down'), when: hasFocus, repeat: true, hidden: true },
    { id: 'shape.moveLeft', title: 'Move idea left', group: 'Shape', keys: ['alt+arrowleft'], run: () => app.moveNode('left'), when: hasFocus, repeat: true, hidden: true },
    { id: 'shape.moveRight', title: 'Move idea right', group: 'Shape', keys: ['alt+arrowright'], run: () => app.moveNode('right'), when: hasFocus, repeat: true, hidden: true },
    {
      id: 'shape.moveTo',
      title: 'Move idea to…',
      group: 'Shape',
      keys: ['g'],
      run: () => app.pushLayer(new MoveMode(app)),
      when: hasFocus,
      hint: 'Pick another idea and this one goes inside it. Dragging with the mouse works too.',
    },
    {
      id: 'shape.center',
      title: 'Make this the center',
      group: 'Shape',
      keys: ['shift+c'],
      run: () => app.makeCenter(),
      when: hasFocus,
      hint: 'The old center becomes one of its branches.',
    },
    { id: 'shape.fold', title: 'Fold or unfold branches', group: 'Shape', keys: ['z'], run: () => app.toggleFold(), when: hasFocus },
    { id: 'shape.unfoldAll', title: 'Unfold everything', group: 'Shape', keys: ['shift+z'], run: () => app.unfoldAll() },
    { id: 'shape.color', title: 'Change branch colour', group: 'Shape', keys: ['c'], run: () => app.cycleHue(), when: hasFocus },
    { id: 'shape.link', title: 'Bridge to another idea', group: 'Shape', keys: ['l'], run: () => app.pushLayer(new LinkMode(app)), when: hasFocus, hint: 'Connect ideas across branches or centers.' },
    { id: 'shape.dup', title: 'Duplicate idea', group: 'Shape', keys: ['mod+d'], run: () => app.dup(), when: hasFocus },
    { id: 'shape.copy', title: 'Copy idea as Markdown', group: 'Shape', keys: ['mod+c'], run: () => app.copy(false), when: hasFocus },
    { id: 'shape.cut', title: 'Cut idea to clipboard', group: 'Shape', keys: ['mod+x'], run: () => app.copy(true), when: hasFocus },
    { id: 'shape.undo', title: 'Undo', group: 'Shape', keys: ['mod+z'], run: () => app.undo(), repeat: true },
    { id: 'shape.redo', title: 'Redo', group: 'Shape', keys: ['mod+shift+z', 'mod+y'], run: () => app.redo(), repeat: true },

    // Spark
    { id: 'spark.spark', title: 'Spark: get a provocation', group: 'Spark', keys: ['s'], run: () => app.spark(), when: hasFocus, hint: 'A prompt appears as a new branch. Answer it, or ↑↓ for another.' },
    {
      id: 'spark.sprint',
      title: 'Start or stop a sprint',
      group: 'Spark',
      keys: ['t'],
      run: () => (app.sprint ? stopSprint(app) : app.pushLayer(new SprintSetup(app))),
      hint: 'A timed burst. Judging is switched off until it ends.',
    },

    // Judge
    { id: 'judge.r1', title: 'Rate ✦', group: 'Judge', keys: ['1'], run: () => app.rate(1), when: hasFocus },
    { id: 'judge.r2', title: 'Rate ✦✦', group: 'Judge', keys: ['2'], run: () => app.rate(2), when: hasFocus },
    { id: 'judge.r3', title: 'Rate ✦✦✦', group: 'Judge', keys: ['3'], run: () => app.rate(3), when: hasFocus },
    { id: 'judge.cut', title: 'Cut (prune) idea', group: 'Judge', keys: ['x'], run: () => app.toggleCut(), when: hasFocus, hint: 'Cut ideas fade but stay until you delete them.' },
    { id: 'judge.clear', title: 'Clear rating and cut', group: 'Judge', keys: ['0'], run: () => app.rate(0), when: hasFocus },
    { id: 'judge.prune', title: 'Prune: review every idea', group: 'Judge', keys: ['p'], run: () => Prune.start(app), hint: 'Walks the map one idea at a time. 1 2 3 rate, X cut.' },
    { id: 'judge.harvest', title: 'Harvest: your best ideas', group: 'Judge', keys: ['h'], run: () => app.pushLayer(new Harvest(app)) },
    { id: 'judge.hideCut', title: 'Hide or show cut ideas', group: 'Judge', keys: ['shift+x'], run: () => app.toggleHideCut() },

    // View
    { id: 'view.layout', title: 'Next layout', group: 'View', keys: ['v'], run: () => app.cycleLayout(1), hint: 'Mind map, tree, top-down, radial.' },
    { id: 'view.layoutPrev', title: 'Previous layout', group: 'View', keys: ['shift+v'], run: () => app.cycleLayout(-1), hidden: true },
    { id: 'view.balanced', title: 'Layout: mind map', group: 'View', run: () => app.setLayout('balanced') },
    { id: 'view.right', title: 'Layout: tree', group: 'View', run: () => app.setLayout('right') },
    { id: 'view.down', title: 'Layout: top-down', group: 'View', run: () => app.setLayout('down') },
    { id: 'view.radial', title: 'Layout: radial', group: 'View', run: () => app.setLayout('radial') },
    { id: 'view.zoomIn', title: 'Zoom in', group: 'View', keys: ['=', '+'], run: () => zoomAroundFocus(app, 1.2), repeat: true },
    { id: 'view.zoomOut', title: 'Zoom out', group: 'View', keys: ['-', '_'], run: () => zoomAroundFocus(app, 1 / 1.2), repeat: true },
    { id: 'view.fit', title: 'Fit the whole map', group: 'View', keys: ['shift+1'], run: () => app.view.fit() },
    {
      id: 'view.focus',
      title: 'Center the focused idea',
      group: 'View',
      keys: ['shift+2', '.'],
      run: () => app.focus && app.view.ensureVisible(app.focus, true),
    },
    { id: 'view.follow', title: 'Toggle follow mode (keep focus centered)', group: 'View', keys: ['shift+f'], run: () => app.toggleFollow() },
    { id: 'view.theme', title: 'Switch theme', group: 'View', keys: ['shift+t'], run: () => app.cycleTheme() },
    { id: 'view.hints', title: 'Show or hide the hint bar', group: 'View', run: () => app.toggleHints() },

    // Maps
    { id: 'maps.open', title: 'All maps', group: 'Maps', keys: ['m'], run: () => app.pushLayer(new MapsPanel(app)) },
    { id: 'maps.new', title: 'New map', group: 'Maps', keys: ['shift+n'], run: () => app.pushLayer(new Composer(app)) },
    { id: 'maps.copyMd', title: 'Copy map as Markdown', group: 'Maps', keys: ['mod+shift+c'], run: () => app.copyMapMarkdown() },
    { id: 'maps.exportMd', title: 'Download map as Markdown', group: 'Maps', run: () => app.exportMarkdown() },
    { id: 'maps.exportJson', title: 'Download this map as JSON', group: 'Maps', run: () => app.exportMapJson() },
    { id: 'maps.backup', title: 'Back up all maps (JSON)', group: 'Maps', run: () => app.exportBackup() },
    { id: 'maps.import', title: 'Import backup or Markdown outline', group: 'Maps', run: () => app.importBackup() },

    // App
    { id: 'app.palette', title: 'Command palette', group: 'App', keys: ['mod+k'], run: () => app.pushLayer(new Palette(app)), hidden: true },
    { id: 'app.help', title: 'Keyboard shortcuts', group: 'App', keys: ['?'], run: () => app.pushLayer(new Help(app)) },
    {
      id: 'app.save',
      title: 'Save',
      group: 'App',
      keys: ['mod+s'],
      run: () => {
        app.store.flush();
        app.toast('Saved in this browser. Back up with “Back up all maps”.', 'good');
      },
      hidden: true,
    },
  ];
  return cmds;
}

function zoomAroundFocus(app: App, factor: number) {
  const r = app.focus ? app.view.screenRect(app.focus) : null;
  if (r && r.x + r.w > 0 && r.x < app.view.vw && r.y + r.h > 0 && r.y < app.view.vh) {
    app.view.zoomBy(factor, r.x + r.w / 2, r.y + r.h / 2);
  } else app.view.zoomBy(factor);
}
