# Ideas on Ideas

A keyboard-first brainstorming canvas. You put a thought in the middle, branch out without stopping to judge, then come back later to prune and keep the best ideas. Everything is stored in your browser's local storage. There is no server and no account.

## The loop

1. **Grow.** Dump everything. `Tab` goes a level deeper, `Enter` adds the next idea, `Shift+Tab` climbs back up. You never leave the keyboard and nothing gets rated yet.
2. **Spark.** When you run dry, `S` attaches a provocation to the focused idea ("What is the opposite of...", "Combine X with Y", a random word, a persona, a constraint). Answer it and press `Enter` for another. `T` starts a timed sprint (3, 5, 10 or 15 minutes) that counts new ideas and switches judging off until time is up.
3. **Prune.** `P` walks the whole map one idea at a time with a spotlight. `1` `2` `3` rate, `X` cuts, arrows skip. Cut ideas fade and strike through but stay on the map until you delete them.
4. **Harvest.** `H` opens your rated ideas, best first, each with its path back to the center. `C` copies them as Markdown.

## Why it works this way

I looked at the research before designing this, and three findings shaped it.

- **People alone out-generate people in a meeting.** Diehl and Stroebe (1987) found that brainstorming groups produce fewer ideas than the same people working separately, and that "production blocking" (waiting your turn) explains most of the loss. The fix here is zero-latency capture: one keystroke per idea, no modal dialogs, no mouse.
- **Judging too early costs ideas.** Osborn's original rule was to defer judgment. So rating and cutting live in their own pass (Prune), and a sprint turns them off completely.
- **Outside stimulus helps when you are stuck.** De Bono's random entry and "po" provocations, and Koestler's idea of bisociation (creativity as two unrelated frames colliding), are the basis of Sparks. The "Collide" spark picks a distant idea on your map and asks how it combines with the focused one; your answer gets a bridge to both.

For convergence, the 1 to 3 rating is weighted dot voting (3 dots for the best, 2, then 1), which is quick and good enough to sort a big pile.

Sources: [Diehl and Stroebe, via SE University PDF](https://homepages.se.edu/cvonbergen/files/2013/01/Productivity-Loss-In-Brainstorming_Toward-the-Solution-of-a-Riddle.pdf), [Koestler's bisociation, The Marginalian](https://www.themarginalian.org/2013/05/20/arthur-koestler-creativity-bisociation/), [How-Now-Wow and dot voting, SessionLab](https://www.sessionlab.com/methods/how-now-wow-matrix), [EUR design toolkit on selection](https://www.eur.nl/en/onderwijsinnovatie/innovation-themes/design-toolkit/selecting), [MindNode shortcut conventions](https://mindnode.com/article/shortcuts-mac).

## Features

- **Map kinds.** Brainstorm, Video, Short, Article, Software, Starburst (who/what/when/where/why/how) and SCAMPER. Each one seeds a few starter branches and weights the spark deck toward that kind of work. A short-form map asks about the first 1.5 seconds and loops; a software map asks who the first user is and what to cut.
- **More than one center.** `N` adds another central idea on the same map.
- **Bridges.** A tree gives every idea one parent, but real things relate in several ways at once. `L` draws a dotted bridge between any two ideas, across branches or centers, then asks how they relate ("flows into", "backs up", "same tier as"). `Tab` flips the direction between plain, one way and the reverse. Labels get a colour each, one-way bridges get an arrowhead, and the bridges on the focused idea light up. `B` opens a drawer with the focused idea's bridges split into goes to, comes from and linked with. `Enter` follows one to the idea at the other end and the drawer comes along, so you can walk a chain. `Tab` in the drawer lists every bridge on the map grouped by label, and selecting a bridge highlights every other bridge with the same label. Bridges are exported in the Markdown map as `A -> B (label)`.
- **Move ideas around.** Drag an idea onto another to nest it there, or onto the top or bottom edge of one to place it before or after. On a touch screen, hold the idea first. From the keyboard, `G` picks a new home with the arrows or jump letters: `Enter` puts it inside, `Shift+Enter` puts it after. `Alt` + arrows still nudge an idea one step at a time.
- **Select several.** `Shift+click` (or `Cmd/Ctrl+click`) adds or removes an idea. From the keyboard, `Shift+↑/↓` extends the selection along a row of ideas from where you started, and the same key backs it off again. Then move them together: drag any selected idea onto a new home, press `G` and pick one with the arrows, or use `Alt` + arrows to reorder, indent or outdent the group. `Backspace` deletes them (undo brings them back) and `Esc` clears the selection. An idea picked along with its parent just rides along with it.
- **Place ideas freely.** Hold `Alt` and drag an idea (or a whole selection) to leave it exactly where you drop it. Its branches go with it, and branch lines and links redraw from the new spot. `Esc` mid-drag cancels. "Put dragged ideas back in place" in the command palette undoes it for the focused branch, or the whole map. Switching layout or moving an idea to a new parent also resets its position. Mouse only for now.
- **Make this the center.** `Shift+C` turns the focused idea into the center of its tree. The old center becomes one of its branches, so nothing is deleted. Useful when you branched off one topic and then grew everything under it.
- **Notes.** `O` opens a scratch pad beside the map for the focused idea, for anything longer than a label. Notes save as you type and stay with the idea when it moves. Ideas with notes show a small mark (click it to open them), search looks inside notes, and the harvest shows them.
- **Four layouts.** `V` cycles mind map (balanced left and right), tree, top-down and radial, with animated transitions.
- **Jump anywhere.** `F` puts a letter on every visible idea; type it to fly there. `/` searches every idea, including folded ones.
- **Command palette.** `⌘K` (Ctrl+K on Windows and Linux) finds every action and every map.
- **Paste lists.** Paste an indented or bulleted list and it becomes a branch. Markdown exported from the app pastes back with ratings, cuts and notes intact (notes are the `>` quote lines under an idea).
- **Export.** Copy a branch, the map or the harvest as Markdown. Download a JSON backup of every map and import it again elsewhere.
- **Light and dark themes**, following the system by default (`Shift+T` switches).
- **Touch.** Phones and tablets get a small toolbar, pinch to zoom and drag to pan. It is built for a keyboard first, though.

## Keyboard

`?` in the app shows the full sheet. The ones you'll use constantly:

| Key | Action |
| --- | --- |
| `Tab` | New branch (child) |
| `Enter` | New idea below (sibling) |
| `Space` or `E` | Edit |
| `O` | Notes for the idea |
| Arrows | Move between ideas |
| `G` | Move the idea somewhere else (or drag it) |
| `Shift+click`, `Shift+↑/↓` | Select several ideas |
| `Alt` + drag | Place an idea freely, with its branches |
| `Alt` + arrows | Reorder, indent, outdent, switch side |
| `L` / `B` | Bridge to another idea / see an idea's bridges |
| `Shift+C` | Make the idea the center |
| `S` | Spark |
| `1` `2` `3` / `X` | Rate / cut |
| `P` / `H` | Prune / harvest |
| `F` / `/` | Jump / search |
| `Z` | Fold a branch |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `M` / `Shift+N` | All maps / new map |

While typing in an idea: `Enter` saves and starts the next one, `Tab` goes deeper, `Shift+Tab` goes back up, `Shift+Enter` adds a line break, `Esc` finishes. An idea left empty disappears.

## Your data

Maps live in `localStorage` under keys starting with `ioi:v1:`. That means:

- They stay on one browser on one device. Another browser or another computer starts empty.
- Clearing site data, or some private-browsing modes, deletes them.
- Use **Back up all maps** in the maps panel (`M`) or the command palette now and then. Import the JSON to restore.

Each map is saved 250 ms after a change and again when the tab is hidden or closed. Undo history lives in memory and resets on reload.

## Develop

Requires Node 20.19+ or 22.12+.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run build` type-checks with `tsc` and writes a static site to `dist/`. `npm run check` runs only the type check.

There are no runtime dependencies apart from two self-hosted font packages (Instrument Sans and Instrument Serif), so the app makes no network requests after it loads.

## Project layout

```
src/
  main.ts            boot
  app/               controller, keyboard handling, command registry, undo store
  model/             map data, copy-on-write operations, storage, templates, Markdown
  sparks/            provocation deck and random-word lists
  view/              layout engine, edge geometry, DOM renderer and camera
  ui/                palette, help, maps, composer, harvest, prune, jump, search, sprint
  styles/main.css    all styles and both themes
```

The canvas is plain DOM plus one SVG layer, with no framework. Arrow-key moves take well under a millisecond and an edit keystroke takes about 9 ms on a 600-idea map, so input never waits on rendering. Nodes animate toward their layout positions with exponential smoothing, which lets a new target interrupt an animation already in flight.
