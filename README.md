# Linak Desk Control for Stream Deck

Linak Desk Control is a Stream Deck plugin for a Home Assistant-backed sit/stand desk.
It gives a single key fast, live feedback for desk position and height while keeping the
interaction simple enough to trust every day.

## What it does

- toggles the desk position with `input_select.select_next`
- lets Home Assistant handle repeated presses while the desk is already moving
- initiates the desk controller connection on long press with `button.press`
- subscribes to Home Assistant state updates over websocket for fast feedback
- shows the current or last known desk height on the key
- keeps the last known desk position visible when the controller is offline
- fades the key icon when the desk is disconnected or sleeping

## Home Assistant entities

By default the plugin expects these entities:

- `input_select.desk_position`
- `cover.office_desk`
- `button.office_desk_connect`
- `binary_sensor.office_desk_standing`
- `binary_sensor.office_desk_connection`
- `input_number.office_desk_last_height`

All entity IDs can be overridden in the property inspector.

## How it behaves

- Pressing the key calls `input_select.select_next` on the configured toggle input when the desk is idle.
- Pressing the key again while the desk is moving calls `input_select.select_next` again and relies on Home Assistant to handle the in-flight target change.
- Long pressing the key calls `button.press` on the configured connect button entity.
- Position and motion updates come from Home Assistant websocket events.
- When the desk is offline, the key keeps showing the last known stable position and height.
- Height values that look like meters are shown in meters instead of centimeters.

The plugin intentionally leaves in-flight target changes and post-cancel behavior to Home Assistant. If reversing or resuming movement after a repeated press matters, handle that in the HA automation behind `input_select.desk_position`.

## Requirements

- Elgato Stream Deck 6.4 or later
- Home Assistant reachable from the Stream Deck host
- a Home Assistant long-lived access token

## Installation

1. Open the latest release on GitHub.
2. Download `com.pedropombeiro.streamdeck-linakdesk.streamDeckPlugin`.
3. Double-click the file to install it into Stream Deck.
4. Add the `Desk position` action to a key and fill in the Home Assistant settings.

## Property inspector fields

- `Toggle input`: Home Assistant input entity the plugin toggles, default `input_select.desk_position`
- `Desk cover`: cover entity used for movement state and UI feedback, default `cover.office_desk`
- `Connect button`: button entity used on long press, default `button.office_desk_connect`
- `Standing sensor`: standing state sensor, default `binary_sensor.office_desk_standing`
- `Connection sensor`: controller connectivity sensor, default `binary_sensor.office_desk_connection`
- `Height entity`: height source shown on the key, default `input_number.office_desk_last_height`

## Development

- `mise run bootstrap` installs prerequisites and configured mise tools
- `mise run lint` runs the configured pre-commit linters
- `mise run lint:fix` runs the manual fixer hooks
- `mise run` builds the plugin bundle
- `mise run install` builds and opens the plugin bundle for Stream Deck installation
- `mise run install:local` builds, extracts, and reinstalls the local plugin copy used by Stream Deck

The build uses Elgato's Stream Deck CLI and produces a `.streamDeckPlugin` bundle in `Release/`.

## Release process

- `CI` runs linting and builds the plugin bundle on pushes and pull requests
- `Release` builds and uploads the plugin bundle to GitHub Releases when a `v*` tag is pushed
