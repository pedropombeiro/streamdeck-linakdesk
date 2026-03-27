# Stream Deck Linak Desk Control integration

`Stream Deck Linak Desk Control` connects an Elgato Stream Deck key to a Linak sit/stand desk exposed in Home Assistant.

The plugin requires Stream Deck 4.1 or later.

## Description

The plugin provides a single action that:

- toggles desk position through `input_select.select_next`
- listens to Home Assistant state changes over websocket for fast feedback
- shows the last known height when available
- keeps the last known position visible when the desk is offline, using a faded icon

## Default Home Assistant entities

- `input_select.desk_position`
- `cover.office_desk`
- `binary_sensor.office_desk_standing`
- `binary_sensor.office_desk_connection`
- `input_number.office_desk_last_height`

All of these can be overridden in the property inspector.

## Development

- `mise run bootstrap` installs prerequisites and configured mise tools
- `mise run lint` runs the configured pre-commit linters
- `mise run lint:fix` runs the manual fixer hooks
- `mise run` builds the plugin bundle
- `mise run install` builds and opens the plugin bundle for Stream Deck installation

The build uses Elgato's official Stream Deck CLI, which provides `streamdeck pack` for generating the `.streamDeckPlugin` bundle.

## Installation

Download the latest release from the GitHub releases page and double-click the `.streamDeckPlugin` file.
