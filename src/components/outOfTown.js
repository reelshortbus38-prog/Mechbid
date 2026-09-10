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

// Nights a period sleeps away. Defaults to the days worked, which is the
// conservative read — a crew that is there for five days and drives home on the
// last one enters four, and one that stays over the weekend enters more. The
// app cannot know which, so it takes the number rather than inventing a rule.
export function ootNights(days, nights) {
  const d = num(days);
  const n = nights === '' || nights === undefined || nights === null ? null : num(nights);
  return n === null ? d : n;
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
export function ootBreakdown({ days = 0, nights, travelers = 0, rates } = {}) {
  const r = { ...newOotRates(), ...(rates || {}) };
  const d = num(days);
  const n = ootNights(d, nights);
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
