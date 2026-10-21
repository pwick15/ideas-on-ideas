import type { App } from '../app/app';
import type { Group } from '../app/commands';
import { escapeHtml, kbd } from '../app/keys';
import { h, modal, type Layer } from './dom';

const GROUPS: { group: Group; title: string; extra?: [string, string][] }[] = [
  {
    group: 'Move',
    title: 'Move around',
    extra: [['arrowup arrowdown arrowleft arrowright', 'Move between ideas']],
  },
  {
    group: 'Grow',
    title: 'Grow',
  },
  {
    group: 'Shape',
    title: 'Shape',
    extra: [['alt+arrowup alt+arrowdown', 'Reorder'], ['alt+arrowleft alt+arrowright', 'Indent, outdent, switch side']],
  },
  { group: 'Spark', title: 'Get unstuck' },
  { group: 'Judge', title: 'Judge (later)' },
  { group: 'View', title: 'View' },
  { group: 'Maps', title: 'Maps' },
  { group: 'App', title: 'App', extra: [['mod+k', 'Command palette (every action)']] },
];

const WHILE_TYPING: [string, string][] = [
  ['enter', 'Save and start the next idea'],
  ['tab', 'Save and go a level deeper'],
  ['shift+tab', 'Save and go back up a level'],
  ['shift+enter', 'Line break'],
  ['escape', 'Done'],
];

export class Help implements Layer {
  readonly name = 'help';
  private wrap: HTMLDivElement;
  private body: HTMLDivElement;

  constructor(private app: App) {
    this.body = h('div', 'help-body');
    const method = h('div', 'method');
    method.innerHTML = [
      ['1', 'Grow', 'Dump everything. <kbd>⇥</kbd> goes deeper, <kbd>↵</kbd> adds the next idea. No judging yet.'],
      ['2', 'Spark', 'Stuck? <kbd>S</kbd> asks a provocation. <kbd>T</kbd> starts a timed sprint.'],
      ['3', 'Prune', '<kbd>P</kbd> walks every idea. <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> rate, <kbd>X</kbd> cut.'],
      ['4', 'Harvest', '<kbd>H</kbd> lists your best ideas, ready to copy as Markdown.'],
    ]
      .map(([n, t, d]) => `<div class="step"><span class="step-n">${n}</span><div><b>${t}</b><p>${d}</p></div></div>`)
      .join('');

    const cols = h('div', 'help-cols');
    const section = (title: string, rows: [string, string][]) => {
      const s = h('section', 'help-group');
      s.innerHTML =
        `<h3>${escapeHtml(title)}</h3>` +
        rows
          .map(
            ([keys, label]) =>
              `<div class="help-row"><span>${escapeHtml(label)}</span><span class="keys">${keys
                .split(' ')
                .map((k) => `<span class="combo">${kbd(k)}</span>`)
                .join('')}</span></div>`,
          )
          .join('');
      return s;
    };
    for (const g of GROUPS) {
      const rows: [string, string][] = [...(g.extra ?? [])];
      for (const c of app.commands) {
        if (c.group !== g.group || !c.keys?.length || (c.id.startsWith('move.') && c.hidden)) continue;
        if (c.id.startsWith('shape.move')) continue;
        if (g.extra?.some(([k]) => k === c.keys![0])) continue;
        rows.push([c.keys.slice(0, 2).join(' '), c.title]);
      }
      cols.append(section(g.title, rows));
    }
    cols.append(section('While typing', WHILE_TYPING));
    this.body.append(method, cols);
    const head = h('div', 'help-head', h('h2', '', 'Keyboard'), h('span', 'muted', 'Everything works without a mouse. Esc closes.'));
    this.wrap = modal('help', () => app.popLayer(this), head, this.body);
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'escape' || combo === '?' || combo === 'enter') {
      this.app.popLayer(this);
      return true;
    }
    if (combo === 'arrowdown' || combo === 'j') this.body.scrollBy({ top: 80 });
    else if (combo === 'arrowup' || combo === 'k') this.body.scrollBy({ top: -80 });
    else return false;
    return true;
  }

  close() {
    this.wrap.remove();
  }
}
