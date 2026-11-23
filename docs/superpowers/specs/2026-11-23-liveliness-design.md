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
| O4 | The window beams breathe and drift by day (first dust in them, dropped: it read as snow); sparks over the braziers; pulses of light along the floor channels (open space) | Flat and 2.5D, not the strip |
| O5 | Number of working sessions (four is full), eased over seconds: pulse pace, the Magos's tempo, a slightly brighter or dimmer hall. A stale petition dims the room a little so the beacon stands out | Flat and 2.5D |

**Approaches.** (a) particles and lights drawn each frame over the cached background, positions from pure functions of
time; (b) animated props taken out of the background. (a) chosen: both views share it through `toScreen` and the lights'
own projection, and it costs no art. (b) is needed for banners, kept for the next round.

**Constraints.** Nothing is added to `app.js` `busy()`: it all runs at the idle rate. No theme key is added (packs stay valid).

## Round two (approved 2026-11-23): O2, O3, O4 second pass

**O2 work has a shape.** The desk screen shows the kind of tool the session last called, read from the task line's tool
name: write (a line being typed, a caret), read (the page scrolls), search (a bar sweeps the page), web (rings spread).
Any other tool, or a prompt, keeps round one's screen. No backend change.

**O3 interactions.** Only true events move anything. An adept that finishes walks to its owner's desk, then leaves. A
session's newly forked child gets its order by servo-skull, from the Suzerain's desk to its own. The Magos leans and
lights its optics for a few seconds when someone joins the petition line. Not in the strip or the column, not on the
first roster.

**O4 second pass.** The back wall's hangings sway an art px; a cloud's light drifts over the window glass, day and night.
Approaches: (a) take them out of the cached background; (b) draw the moved cloth over the still one. (b) chosen: the
background stays cached, and an art px of the still cloth showing at an edge reads as its outline. Only cloth sways
(the Imperium's, Arcane Tower's) and only a window on a sky has clouds (not Orbital Station, not Vault 111). A hanging
that another prop overlaps stays still in 2.5D. In 2.5D both lie on the back wall's plane.

**After seeing it (2026-11-23).** The hangings' sway is removed: an art px of shear looks ugly on the cloth. The clouds stay.
