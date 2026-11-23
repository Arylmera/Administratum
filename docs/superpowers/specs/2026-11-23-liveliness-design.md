# Liveliness: scribes at work, room ambience, hall mood

**Why.** Between events the hall is almost still (about 1.6 % of the pixels moved in the 40k flat night view). A busy
scribe is a fixed sprite, and no built-in world drew the gestures the code supports.

**Goals.** O1 a busy scribe reads as working. O4 the air moves a little. O5 the hall's pace follows the load.
**Non-goals.** O2 (work has a shape) and O3 (interactions); banner sway and window weather (baked into the cached
background of both views). Custom art for the worlds with their own scribe.
**Anti-goals.** Fake walks (a walk means a status change); a bobbing scribe body; anything louder than a petition; a
higher frame rate at rest.

**Setting.** Settings > Appearance > Liveliness: off / subtle / full (default full). Off is the hall as it was before.

| | What | Where it shows |
|---|---|---|
| O1 | Arms type in bursts (the body never moves); the desk screen scrolls while its scribe works; think, wonder and stretch frames for the 40k scribe, its three ranks, both views | Arms, gestures: the 40k robe. Screen: every desk whose `screen` anchor is glass in the art (not Arcane Tower, not Darwin) |
| O4 | Dust in the window beams by day; sparks over the braziers; pulses of light along the floor channels (open space) | Flat and 2.5D, not the strip |
| O5 | Share of working sessions, eased over seconds: pulse pace, the Magos's tempo, a slightly brighter or dimmer hall. A stale petition dims the room a little so the beacon stands out | Flat and 2.5D |

**Approaches.** (a) particles and lights drawn each frame over the cached background, positions from pure functions of
time; (b) animated props taken out of the background. (a) chosen: both views share it through `toScreen` and the lights'
own projection, and it costs no art. (b) is needed for banners, kept for the next round.

**Constraints.** Nothing is added to `app.js` `busy()`: it all runs at the idle rate. No theme key is added (packs stay valid).
