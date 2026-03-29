# Repository Guidance

This repo builds a local Stream Deck plugin for a Home Assistant-backed Linak desk.

## Stream Deck Local Install Workflow

- Do not assume opening `Release/com.pedropombeiro.streamdeck-linakdesk.streamDeckPlugin` updates the installed plugin in place.
- Stream Deck may show an install/update prompt but still leave the unpacked plugin at `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.pedropombeiro.streamdeck-linakdesk.sdPlugin` unchanged.
- Verify the actually installed plugin files directly when debugging local behavior, especially `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/app.js` and `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/manifest.json`.
- The build artifact `Release/com.pedropombeiro.streamdeck-linakdesk.streamDeckPlugin` is a zip archive containing a top-level `com.pedropombeiro.streamdeck-linakdesk.sdPlugin/` directory.
- For reliable local testing, extract that archive into `~/Library/Application Support/com.elgato.StreamDeck/Plugins/` and restart `Elgato Stream Deck.app`.
- A safe replacement flow is to back up the installed plugin directory, extract the archive into the plugins directory, then relaunch the app.

## Validation Workflow

- After code changes, run `mise run lint`.
- For local plugin validation, prefer an explicit install flow that replaces the unpacked installed plugin, not just `open "$RELEASE_FILE"`.
- `mise run install:local` is the preferred local reinstall path because it extracts the built plugin into Stream Deck's plugins directory and restarts the app.
- After reinstalling, confirm the installed `app.js` contains the expected new code before trusting runtime behavior.

## Logging And Debugging

- Runtime plugin logging via `console.log` can be useful, but only after confirming the installed plugin files are current.
- Prefix plugin debug logs consistently; `[linakdesk]` is the current prefix in `Sources/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/app.js`.
- Useful log locations on macOS:
  - `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`
  - `log show --last 10m --style compact --predicate 'eventMessage CONTAINS "linakdesk" OR eventMessage CONTAINS "com.pedropombeiro.streamdeck-linakdesk"'`
- `log stream` must be invoked via `/usr/bin/log` in this shell environment because `log` is otherwise resolved by zsh as a shell builtin/function and errors with `too many arguments`.

## Shell And Safety Notes

- The shell wrapper refuses `rm -rf`; use `trash` or a scripted non-destructive replacement path instead.
- When replacing the installed plugin, keep longer `mise` task bodies in `mise/tasks/` helpers instead of embedding large inline scripts in `mise.toml`.
- When replacing the installed plugin, a small Python extraction step inside a `mise` task helper is a practical option because the `.streamDeckPlugin` file is a zip archive.
- If the install/debug flow becomes reusable beyond this repo, consider promoting it into an agent skill with a `scripts/` helper rather than repeating ad hoc shell commands.

## Plugin-Specific Notes

- The action implementation lives in `Sources/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/app.js`.
- Property inspector fields and defaults live in `Sources/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/propertyinspector/index.html` and `Sources/com.pedropombeiro.streamdeck-linakdesk.sdPlugin/propertyinspector/js/index_pi.js`.
- The plugin currently expects Home Assistant-side behavior to decide how repeated or in-flight `input_select.desk_position` changes are handled; do not bake HA automation policy into the plugin unless explicitly requested.
- If behavior changes do not appear in Stream Deck, check the installed plugin copy first before assuming the event logic is wrong.
