import type { App } from '../app/app';
import { kbd } from '../app/keys';
import { h, modal, type Layer } from './dom';
import { Prune } from './prune';

const CHOICES = [3, 5, 10, 15];
const RING = 2 * Math.PI * 9;

let running: { timer: number; end: number; minutes: number; hud: HTMLElement; added: number; started: number } | null = null;

export class SprintSetup implements Layer {
  readonly name = 'sprint-setup';
  private wrap: HTMLDivElement;
  private chips: HTMLDivElement;
  private sel: number;

  constructor(private app: App) {
    this.sel = Math.max(0, CHOICES.indexOf(app.settings.sprintMinutes));
    this.chips = h('div', 'chips');
    CHOICES.forEach((m, i) => {
      const c = h('button', { class: 'chip', type: 'button' }, h('b', '', String(m)), h('span', '', 'min'));
      c.addEventListener('click', () => {
        this.sel = i;
        this.start();
      });
      this.chips.append(c);
    });
    const foot = h('div', 'panel-foot');
    foot.innerHTML = `<span class="hint">${kbd('arrowleft')}${kbd('arrowright')}<span>length</span></span><span class="hint">${kbd('enter')}<span>start</span></span><span class="hint">${kbd('escape')}<span>cancel</span></span>`;
    const focusText = app.focus ? app.doc.nodes[app.focus].text : '';
    this.wrap = modal(
      'sprint',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', 'Sprint'),
      h('h2', 'sprint-title', 'Quantity first.'),
      h(
        'p',
        'muted',
        `Write as many ideas as you can${focusText ? ` around “${focusText.slice(0, 40)}”` : ''}. Ratings and cuts are switched off until the timer ends, so nothing gets judged too early.`,
      ),
      this.chips,
      foot,
    );
    this.paint();
  }

  private paint() {
    this.chips.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('sel', i === this.sel));
  }

  private start() {
    const minutes = CHOICES[this.sel];
    this.app.settings.sprintMinutes = minutes;
    this.app.saveSettings();
    this.app.popLayer(this);
    startSprint(this.app, minutes);
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    switch (combo) {
      case 'escape':
        this.app.popLayer(this);
        return true;
      case 'arrowleft':
      case 'arrowup':
        this.sel = (this.sel - 1 + CHOICES.length) % CHOICES.length;
        this.paint();
        return true;
      case 'arrowright':
      case 'arrowdown':
      case 'tab':
        this.sel = (this.sel + 1) % CHOICES.length;
        this.paint();
        return true;
      case 'enter':
      case 't':
        this.start();
        return true;
    }
    return true;
  }

  close() {
    this.wrap.remove();
  }
}

function startSprint(app: App, minutes: number) {
  const hud = h('div', { class: 'hud sprint-hud', role: 'timer' });
  hud.innerHTML = `<svg viewBox="0 0 22 22" class="ring"><circle cx="11" cy="11" r="9" class="track"/><circle cx="11" cy="11" r="9" class="fill" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg><span class="sprint-time"></span><span class="sprint-count">0 ideas</span>`;
  hud.title = 'Sprint running. T stops it.';
  app.topbar.slot.prepend(hud);
  const now = Date.now();
  running = { timer: 0, end: now + minutes * 60_000, minutes, hud, added: 0, started: now };
  app.sprint = {
    added: 0,
    onIdea() {
      if (!running) return;
      running.added++;
      this.added = running.added;
      const c = running.hud.querySelector('.sprint-count')!;
      c.textContent = `${running.added} ${running.added === 1 ? 'idea' : 'ideas'}`;
      running.hud.classList.remove('bump');
      void (running.hud as HTMLElement).offsetWidth;
      running.hud.classList.add('bump');
    },
  };
  const tick = () => {
    if (!running) return;
    const left = Math.max(0, running.end - Date.now());
    const total = running.minutes * 60_000;
    const s = Math.ceil(left / 1000);
    running.hud.querySelector('.sprint-time')!.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    (running.hud.querySelector('.fill') as SVGCircleElement).setAttribute('stroke-dashoffset', String(RING * (1 - left / total)));
    running.hud.classList.toggle('late', left < 30_000);
    if (left <= 0) stopSprint(app, true);
  };
  running.timer = window.setInterval(tick, 250);
  tick();
  app.toast(`Sprint: ${minutes} minutes. Go.`, 'good');
  app.hintbar.update();
}

export function stopSprint(app: App, finished = false) {
  if (!running) return;
  const r = running;
  running = null;
  clearInterval(r.timer);
  r.hud.remove();
  app.sprint = null;
  const elapsed = Math.round((Date.now() - r.started) / 1000);
  if (!finished) {
    app.toast(`Sprint stopped. ${r.added} new ${r.added === 1 ? 'idea' : 'ideas'}.`);
    return;
  }
  app.pushLayer(new SprintDone(app, r.added, elapsed));
}

class SprintDone implements Layer {
  readonly name = 'sprint-done';
  private wrap: HTMLDivElement;

  constructor(private app: App, added: number, seconds: number) {
    const rate = seconds ? (added / (seconds / 60)).toFixed(1) : '0';
    const foot = h('div', 'panel-foot');
    foot.innerHTML = `<span class="hint">${kbd('enter')}<span>keep going</span></span><span class="hint">${kbd('p')}<span>prune now</span></span>`;
    this.wrap = modal(
      'sprint done',
      () => app.popLayer(this),
      h('div', 'composer-eyebrow', 'Time'),
      h('div', 'big-number', String(added)),
      h('p', 'muted', `new ${added === 1 ? 'idea' : 'ideas'} in ${Math.round(seconds / 60)} minutes, about ${rate} a minute. Judging is back on.`),
      foot,
    );
  }

  key(_e: KeyboardEvent, combo: string): boolean {
    if (combo === 'p') {
      this.app.popLayer(this);
      Prune.start(this.app);
      return true;
    }
    if (combo === 'enter' || combo === 'escape' || combo === 'space') {
      this.app.popLayer(this);
      return true;
    }
    return true;
  }

  close() {
    this.wrap.remove();
  }
}
