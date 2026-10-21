# Architecture rules
- Home relocation prompting is owned by the authenticated `home-relocation-prompt` Edge Function, with cross-device response state on profiles; this keeps proprietary decisions and all writes off clients.
- Executive Home mounts the shared relocation dialog after existing higher-priority prompts; web and native shells share the same UI and server rules without platform forks.