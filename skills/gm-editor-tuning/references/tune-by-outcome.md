# Tune by outcome

Use the range and step from the pattern card that introduced each knob. This table supplies direction only; change one
knob at a time, observe the named outcome, and keep or revert it before moving to the next row.

| Observed outcome | First knob and direction | Recheck |
|---|---|---|
| `jump feels floaty` | Lower `apexSeconds`. | The arc still clears scoped geometry. |
| `fall feels weightless` | Raise `fallGravityMultiplier`; lower `apexSeconds` only if the whole arc is slow. | Landing remains readable. |
| `jump input feels unforgiving` | Raise `jumpBufferMs`, then `coyoteMs` if ledge timing is the problem. | A deliberate late press still misses. |
| `jump input feels sticky` | Lower `jumpBufferMs`. | Quick repeated presses do not queue surprises. |
| `camera feels twitchy` | Raise the deadzone dimensions or lower `followLerp`. | The player stays visible near bounds. |
| `camera feels sluggish` | Raise `followLerp` or shrink the deadzone dimensions. | Direction changes do not snap. |
| `impacts feel weak` | Raise `maxHitStopMs`, `maxTrauma`, or `maxFlashMs` for the affected tier. | Light and heavy hits remain distinct. |
| `impact feedback lingers` | Raise `traumaDecayPerSecond` or lower `maxFlashMs`. | Motion and flash return fully to rest. |
| `drop-through feels delayed` | Lower `reentryMs`. | The player does not immediately catch the same platform. |
| `drop-through catches too soon` | Raise `reentryMs`. | Landing on the next platform still works. |
