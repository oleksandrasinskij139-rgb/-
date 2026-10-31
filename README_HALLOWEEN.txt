LuxVisuals Halloween website demo

Pages:
- index.html — main page; launcher block replaced with LuxVisuals Mod (download disabled/coming soon)
- account.html — token login + demo account; nickname and avatar editor
- graffiti.html — community graffiti; demo publishing costs 10 tokens
- resource-packs.html — upload resource pack with cover, title, description and ZIP file
- configs.html — upload configuration with cover, title, description and ZIP file
- admins/ — existing admin panel files

DEMO NOTES:
All newly added user profile, token balance, graffiti, resource pack and config data are stored in this browser's localStorage. They are not uploaded to a server and are not shared between devices. Replace demo handlers with API endpoints when connecting the backend.
The mod download button is intentionally disabled until a real download URL is configured.
Ghost artwork: assets/ghost.png. Token artwork: assets/token.png.
