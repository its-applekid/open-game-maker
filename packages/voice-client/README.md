# `@ogm/voice-client`

Browser-only voice utilities for Open Game Maker 2000. The package provides the
vendored `voice_converse` v1 wire contract, two-way PCM voice transport,
framework-free captions, push-to-talk browser dictation, and sentence-level
read-aloud.

No provider key or server implementation lives in this package. Call
`VoiceClient.startFromGesture()` directly from a user activation so microphone
and audio playback permissions can be requested by the browser.
