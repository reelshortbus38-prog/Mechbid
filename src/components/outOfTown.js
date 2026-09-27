// ── OUT OF TOWN, ITEMISED ───────────────────────────────────────────────────
// This was one dollar figure per day, multiplied either by the whole crew or
// by nothing — a single `ootBasis` switch for everything at once. That is not
// a lack of detail, it is wrong, because the three things inside it do not
// multiply the same way:
//
//   MEALS   per person, per DAY. The one the flat rate got right.
//   HOTEL   per room, per NIGHT. Nights are not days — a crew that works
//           Monday to Friday and drives home Friday sleeps four nights on a
//           five-day week — and two men to a room halves the rooms.
//   FUEL    per TRUCK. Three men in one truck is one fuel bill, so charging it
//           per person overstates it by two thirds on that crew.
//
// With one switch you pick a multiplier and at least one of the three is wrong.
// Set it per-person and the fuel triples; set it per-crew and the meals are a
// third of what they should be.
//
// WHAT IS NOT IN HERE: travel TIME. That is paid hours, not an expense — it
// belongs with labor, where it can take the crew's rate and the overtime and
// night multipliers, and where it shows up in the hours the close-out card
// compares. Putting it in a per-diem dollar figure hid it from all of that.
//
// THE FLAT RATE STILL WORKS. A job that has never been itemised keeps its
// ootPerDay and prices exactly as it did — see ootIsItemised. Nothing reprices
// because this shipped.
//
// Pure — no React, no store.

export const newOotRates = () => ({
  mealsPerPersonDay: 0,
  hotelPerRoomNight: 0,
  personsPerRoom: 1,
  fuelPerTruckDay: 0,
  trucks: 1,
});

const num = v => Math.max(0, parseFloat(v) || 0);

// Is the itemised model actually in use on this job? Only if somebody has put
// money in one of the three. Until then the old flat per-day figure is the
// live number and this module keeps its hands off.
export function ootIsItemised(rates) {
  if (!rates) return false;
  return num(rates.mealsPerPersonDay) > 0
    || num(rates.hotelPerRoomNight) > 0
    || num(rates.fuelPerTruckDay) > 0;
}

// ── A WEEK OF WORK IS ONE FEWER NIGHT THAN IT IS DAYS ───────────────────────
// This defaulted to the days worked, described here as "the conservative read
// — the app cannot know which, so it takes the number rather than inventing a
// rule." There IS a rule, and it came from the mechanic in one line:
//
//   "Well with 4 days a week that would be 3 nights a week"
//
// You drive up the first morning and home the last evening, so every week away
// is one night short of its days. On the job in front of him — 27 weeks at 4
// days — that is 81 nights, not 108. Four rooms at $120 made the old default
// $12,960 too much, on a figure nobody had reason to look at because it was
// never shown.
//
// "Conservative" was the wrong word for it too. Over-buying copper is
// conservative; over-booking a hotel is just wrong, and it is wrong in the
// direction that loses the bid.
//
// WITHOUT A DAYS-PER-WEEK it still falls back to a night per day. A period
// that carries total days and no week length cannot be divided into weeks, and
// guessing five would be the invented rule this replaces.
//
// Set nights by hand and none of this applies — a crew that drives up Sunday
// night sleeps a night per day, and the box is there to say so.
export function ootNights(days, nights, daysPerWeek) {
  const d = num(days);
  const n = nights === '' || nights === undefined || nights === null ? null : num(nights);
  if (n !== null) return n;
  return defaultNights(d, daysPerWeek);
}

// Days worked, less one night for each week away.
export function defaultNights(days, daysPerWeek) {
  const d = num(days);
  const dpw = num(daysPerWeek);
  if (!(d > 0)) return 0;
  // One day a week is a day trip, not a stay; anything under two cannot be a
  // week with a drive home in it.
  if (!(dpw > 1)) return d;
  const weeks = Math.ceil(d / dpw);
  return Math.max(0, d - weeks);
}

// Rooms for a crew, rounded UP — three men two to a room is two rooms, not
// one and a half.
export function ootRooms(travelers, personsPerRoom) {
  const people = Math.max(0, Math.round(num(travelers)));
  const per = Math.max(1, num(personsPerRoom) || 1);
  return Math.ceil(people / per);
}

// → { meals, hotel, fuel, total, rooms, nights } for one period.
//
// travelers is the count of crew who actually travel — the crew card already
// carries that per man, because somebody local to the store does not get a
// hotel room.
export function ootBreakdown({ days = 0, nights, travelers = 0, rates, daysPerWeek } = {}) {
  const r = { ...newOotRates(), ...(rates || {}) };
  const d = num(days);
  const n = ootNights(d, nights, daysPerWeek);
  const people = Math.max(0, Math.round(num(travelers)));
  const rooms = ootRooms(people, r.personsPerRoom);
  const trucks = Math.max(0, Math.round(num(r.trucks)));

  const meals = num(r.mealsPerPersonDay) * people * d;
  const hotel = num(r.hotelPerRoomNight) * rooms * n;
  const fuel = num(r.fuelPerTruckDay) * trucks * d;
  return {
    meals: Math.round(meals * 100) / 100,
    hotel: Math.round(hotel * 100) / 100,
    fuel: Math.round(fuel * 100) / 100,
    total: Math.round((meals + hotel + fuel) * 100) / 100,
    rooms, nights: n, travelers: people, trucks,
  };
}

// The figure broken into readable lines for the period card, so the number is
// legible rather than one that appeared.
export function ootLines(b) {
  const out = [];
  if (b.meals > 0) out.push({ key: 'meals', label: `Meals — ${b.travelers} away`, amount: b.meals });
  if (b.hotel > 0) out.push({ key: 'hotel', label: `Hotel — ${b.rooms} room${b.rooms === 1 ? '' : 's'} × ${b.nights} night${b.nights === 1 ? '' : 's'}`, amount: b.hotel });
  if (b.fuel > 0) out.push({ key: 'fuel', label: `Fuel — ${b.trucks} truck${b.trucks === 1 ? '' : 's'}`, amount: b.fuel });
  return out;
}
