# Local media workflow

This directory keeps original research media and optimized previews outside the deployed site.

```text
media/
├── source/       # original files; ignored by Git
│   ├── figures/
│   ├── videos/
│   └── animations/
└── ready/        # generated web versions; ignored by Git
    ├── figures/
    ├── videos/
    └── animations/
```

The approved website assets live under `public/media/` and are committed to Git.

## Requirements

On macOS, install the media tools once:

```sh
brew install ffmpeg webp
```

The optimizer uses `ffprobe` to inspect images, `cwebp` to create WebP figures, and `ffmpeg` to create browser-compatible H.264 MP4 videos and animations.

## Optimize media

1. Place original files in the matching directory under `media/source/`.
2. Run:

   ```sh
   npm run media:optimize
   ```

3. Review the generated files under `media/ready/`.
4. Manually copy approved files to the matching directory under `public/media/`.
5. Update the corresponding `src/content/` media path when the filename or extension changes.
6. Run `npm run verify` before committing.

Every run replaces `media/ready/`; do not store hand-edited files there.

## Defaults

- Figures become WebP and are reduced to at most 3200 pixels wide without upscaling. PNG files up to 1 MB use lossless WebP; larger images use quality 88.
- Videos and animations become H.264 MP4 with AAC audio when present, `yuv420p` browser-compatible pixels, fast-start metadata, and a maximum 1920×1080 frame.
- Nested directories below each media category are preserved.

The defaults can be changed for one run with environment variables:

```sh
MEDIA_IMAGE_MAX_WIDTH=2400 MEDIA_IMAGE_QUALITY=85 npm run media:optimize
MEDIA_IMAGE_LOSSLESS_MAX_BYTES=2097152 npm run media:optimize
MEDIA_VIDEO_CRF=22 npm run media:optimize
```
