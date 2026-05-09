# Audio Source (gitignored working folder)

This folder is gitignored. It holds the **raw and intermediate** audio files that are used to produce the final shipped assets. Only the final encoded MP3s in `public/assets/audio/` are committed.

## Layout

```
.audio-source/
├── README.md            this file (the only file here that's NOT gitignored)
├── raw/                 raw exports from sound generators (WAV, AIFF, etc.)
│   └── fire/
│       ├── fire-take-1.wav
│       └── fire-take-2.wav
├── working/             intermediate cuts, alternates, A/B comparisons
│   └── fire/
│       ├── fire-take-1.trimmed.wav
│       └── fire-take-2.trimmed.wav
```

## Why a separate folder

- WAVs are 5-10x larger than MP3s; committing them bloats the repo without helping anyone download the game faster (the browser only loads the MP3).
- Generator working files often contain prompt metadata or timestamps that don't belong in a public repo.
- License attribution lives in `public/assets/CREDITS.md`, not in the raw files.

## Reproducibility

Whoever needs to regenerate a sound from scratch should be able to drop a fresh raw export here, run the same `ffmpeg` recipe documented in the parent `README.md` (or in this folder if a sound has special needs), and produce a byte-identical-ish MP3 to ship. The recipe is the source of truth, not the WAV.
