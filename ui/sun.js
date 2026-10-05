// Sun times for Auto lighting: NOAA general solar position (fractional year, equation of time,
// declination, hour angle), good to a minute or two away from the poles.
const RAD = Math.PI / 180;

// Sunrise/sunset (zenith 90.833°) and civil dawn/dusk (96°) on date's local calendar day, as Dates.
// A time the sun never reaches is null; polar is 'day' (never sets), 'night' (never rises) or null.
export function sunTimes(date, lat, lon) {
  const day0 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const doy = (day0 - Date.UTC(date.getFullYear(), 0, 1)) / 864e5; // 0-based
  const g = 2 * Math.PI / 365 * (doy - lon / 360); // fractional year at local solar noon
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const at = (zenith, sign) => {
    const c = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (c < -1 || c > 1) return { never: c > 1 ? 'night' : 'day' };
    const ha = Math.acos(c) / RAD;
    return { t: new Date(day0 + (720 - 4 * (lon + sign * ha) - eqt) * 6e4) };
  };
  const rise = at(90.833, 1), set = at(90.833, -1), dawn = at(96, 1), dusk = at(96, -1);
  return { sunrise: rise.t ?? null, sunset: set.t ?? null, civilDawn: dawn.t ?? null, civilDusk: dusk.t ?? null, polar: rise.never ?? null };
}

// Auto phase at `now` for sunTimes of now's day: dusk spans civil twilight plus the half hour of low sun.
export function sunPhase(now, sun) {
  if (sun.polar === 'day') return 'day';
  const { civilDawn: a, civilDusk: z } = sun;
  if (sun.polar === 'night') return a && now >= a && now < z ? 'dusk' : 'night';
  if ((a && now < a) || (z && now >= z)) return 'night'; // no civil time: the sun never sinks that far (white nights)
  const HALF = 30 * 6e4;
  return now >= sun.sunrise.getTime() + HALF && now < sun.sunset.getTime() - HALF ? 'day' : 'dusk';
}
