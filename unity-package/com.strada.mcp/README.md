# Strada MCP Bridge for Unity

Unity Editor package that bridges the Strada.MCP server with the Unity Editor via TCP JSON-RPC 2.0.

## Installation

Add to your Unity project via the Package Manager using the git URL or copy the package folder to your project's `Packages/` directory.

## Configuration

Open **Strada > MCP > Settings** in the Unity menu bar to configure the bridge:

- **Port**: TCP port (default: 7691)
- **Auto-start**: Automatically start the bridge server on domain reload

## Supported Commands

| Method | Description |
|---|---|
| `gameobject.create` | Create GameObjects (empty, primitive, prefab) |
| `gameobject.find` | Find GameObjects by name, tag, layer, or component |
| `gameobject.modify` | Modify name, active state, tag, layer, static flags |
| `gameobject.delete` | Delete GameObjects with Undo support |
| `gameobject.duplicate` | Duplicate GameObjects with offset |
| `component.add` | Add components by type name |
| `component.remove` | Remove components with Undo |
| `component.list` | List all components on a GameObject |
| `transform.set` | Set position, rotation, scale |
| `transform.get` | Get current transform values |
| `transform.setParent` | Reparent GameObjects |
| `editor.playMode` | Control Play/Pause/Stop/Step |
| `editor.getPlayState` | Get current play mode state |
| `editor.executeMenu` | Execute Unity menu items |
| `editor.log` | Write to Unity console |
| `editor.clearConsole` | Clear the console |
| `editor.getSelection` | Get current selection |
| `editor.setSelection` | Set editor selection |

## Events

The bridge broadcasts Unity events as JSON-RPC notifications:

- `unity.sceneChanged` - Hierarchy changes
- `unity.consoleMessage` - Log messages
- `unity.compileStarted` / `unity.compileFinished` - Compilation
- `unity.playModeChanged` - Play state transitions
- `unity.selectionChanged` - Selection changes
