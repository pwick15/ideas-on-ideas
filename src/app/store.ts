import { saveMap } from '../model/storage';
import type { Camera, Id, MapDoc } from '../model/types';

interface Snap {
  doc: MapDoc;
  focus: Id | null;
}

const LIMIT = 300;

/**
 * Holds the open map, its undo history and autosave. Docs are immutable, so a
 * history entry is just a reference to the previous version.
 */
export class Store {
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];
  private timer = 0;
  view: { focus: Id | null; cam?: Camera } = { focus: null };
  onSaveFailed: () => void = () => {};
  onSaved: () => void = () => {};

  constructor(public doc: MapDoc) {
    this.view = { focus: doc.view?.focus ?? null, cam: doc.view?.cam };
  }

  /** Apply a change and record the previous version for undo. */
  commit(next: MapDoc, focusBefore: Id | null) {
    if (next === this.doc) return;
    this.undoStack.push({ doc: this.doc, focus: focusBefore });
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.doc = next;
    this.save();
  }

  /** Change the current version in place, folding it into the last history entry. */
  amend(next: MapDoc) {
    this.doc = next;
    this.save();
  }

  /** Throw away the current version and step back without leaving a redo entry. */
  discard(): Snap | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.doc = prev.doc;
    this.save();
    return prev;
  }

  undo(focusNow: Id | null): Snap | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push({ doc: this.doc, focus: focusNow });
    this.doc = prev.doc;
    this.save();
    return prev;
  }

  redo(focusNow: Id | null): Snap | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push({ doc: this.doc, focus: focusNow });
    this.doc = next.doc;
    this.save();
    return next;
  }

  save() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 250);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = 0;
    const ok = saveMap({ ...this.doc, view: { focus: this.view.focus, cam: this.view.cam } });
    if (ok) this.onSaved();
    else this.onSaveFailed();
  }

  get pending() {
    return this.timer !== 0;
  }
}
