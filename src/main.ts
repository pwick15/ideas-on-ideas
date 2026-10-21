import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource/instrument-serif/400.css';
import './styles/main.css';
import { App } from './app/app';
import { Touchbar } from './ui/touchbar';
import { Welcome } from './ui/welcome';

const root = document.getElementById('app')!;
const app = new App(root);
root.append(new Touchbar(app).el);
app.boot();
if (!app.settings.welcomed) app.pushLayer(new Welcome(app));
if (import.meta.env.DEV) Object.assign(window, { app });
