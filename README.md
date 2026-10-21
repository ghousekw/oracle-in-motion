# Oracle in Motion

An animated Oracle course in Hinglish, with a voice-over and captions, plus a built-in Oracle playground that runs in the browser.

The courses are DBA (36 lessons), SQL Basics (61), Functions (38), PL/SQL (31) and Python + Oracle (7).

## Layout

- `public/index.html` is the whole app in one self-contained page.
- `public/voice/` holds one MP3 per lesson.
- `netlify.toml` tells Netlify to publish `public/`. There is no build step.

## Run locally

```
cd public
python -m http.server 8080
```

Then open http://localhost:8080.
