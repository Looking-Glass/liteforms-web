# Native Looking Glass Bridge assets

Electron packages these folders into `resources/bridge/<platform-arch>` and probes them from an isolated helper process. These files are the Bridge SDK dynamic libraries used for in-process native detection; they do not need `LookingGlassBridge.exe` to be running.

Expected layouts:

- `win32-x64/bridge_inproc.dll` plus its adjacent dependency DLLs.
- `darwin-x64/libbridge_inproc.dylib` plus adjacent dependencies.
- `darwin-arm64/libbridge_inproc.dylib` plus adjacent dependencies.

The Windows x64 folder is populated from `Bridge-Python-SDK/src/bridge_python_sdk/bin/win`. The Bridge SDK copy currently present in this workspace does not include macOS dylibs, so those folders need to be populated before producing macOS installers.
