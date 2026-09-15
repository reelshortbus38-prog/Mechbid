import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import Step3Rack from './Step3_Rack.jsx';
import { taskMen, manHoursOf } from './laborUnits.js';
import { calcRackTaskCost, calcFieldTaskCost, calcRackLaborTotal } from '../state/store.js';

// ── ZERO IS AN ANSWER ────────────────────────────────────────────────────────
// `parseFloat(task.men) || 1` reads a blank box as one man, which is right.
// It also reads an explicit 0 as one man, because 0 is falsy and `||` cannot
// tell "nobody typed anything" from "somebody typed nothing".
//
// Zeroing the crew is how an estimator says the GC has that one. The Men box
// took the 0, showed the 0, and the bid charged for a man anyway — eight hours
// at a hundred dollars is eight hundred dollars added back silently, with the
// screen agreeing with him and the total not.

describe('taskMen tells a zero from a blank', () => {
  it('honours an explicit zero', () => {
    expect(taskMen({ men: 0 }, 1)).toBe(0);
    expect(taskMen({ men: '0' }, 1)).toBe(0);
  });

  it('falls back only when nobody said', () => {
    expect(taskMen({}, 1)).toBe(1);
    expect(taskMen({ men: undefined }, 1)).toBe(1);
    expect(taskMen({ men: null }, 1)).toBe(1);
    expect(taskMen({ men: '' }, 1)).toBe(1);
    expect(taskMen(undefined, 1)).toBe(1);
  });

  it('falls back on nonsense rather than billing nothing', () => {
    expect(taskMen({ men: 'two' }, 1)).toBe(1);
    expect(taskMen({ men: NaN }, 1)).toBe(1);
  });

  it('takes the number when there is one', () => {
    expect(taskMen({ men: 4 }, 1)).toBe(4);
    expect(taskMen({ men: '3' }, 1)).toBe(3);
  });

  it('never goes negative', () => {
    expect(taskMen({ men: -2 }, 1)).toBe(0);
  });

  it('defaults to zero when no fallback is given', () => {
    expect(taskMen({})).toBe(0);
  });
});

describe('manHoursOf', () => {
  it('is men × hours', () => {
    expect(manHoursOf({ men: 3, hrs: 8 })).toBe(24);
  });

  it('carries the zero through', () => {
    expect(manHoursOf({ men: 0, hrs: 8 }, 1)).toBe(0);
  });

  it('is zero with no hours, whatever the crew', () => {
    expect(manHoursOf({ men: 4 })).toBe(0);
    expect(manHoursOf({ men: 4, hrs: 'x' })).toBe(0);
  });
});

// ── AND THE MONEY ────────────────────────────────────────────────────────────
describe('a rack task set to zero men costs nothing', () => {
  const crew = [{ id: 'a', rate: 100 }];

  it('was charging a full man for a crew the estimator removed', () => {
    expect(calcRackTaskCost({ men: 0, hrs: 8 }, crew)).toBe(0);
  });

  it('still reads a row that names nobody as one man', () => {
    expect(calcRackTaskCost({ hrs: 8 }, crew)).toBe(800);
    expect(calcRackTaskCost({ men: '', hrs: 8 }, crew)).toBe(800);
  });

  it('is unchanged for every row that names a crew', () => {
    expect(calcRackTaskCost({ men: 4, hrs: 2 }, crew)).toBe(800);
    expect(calcRackTaskCost({ men: 1, hrs: 8 }, crew)).toBe(800);
  });

  it('drops out of the rack total too, not just the row', () => {
    const tasks = [{ men: 2, hrs: 4 }, { men: 0, hrs: 8 }];
    expect(calcRackLaborTotal(tasks, crew)).toBe(800);
  });

  it('leaves a crew-assigned task alone — that path never read men', () => {
    const t = { men: 0, hrs: 4, crewAssignment: { a: 2 } };
    expect(calcRackTaskCost(t, crew)).toBe(800);
  });
});

describe('field tasks are unchanged', () => {
  const crew = [{ id: 'a', rate: 100 }];

  it('an unset crew still costs nothing, so no saved bid moves', () => {
    // Every path that creates a field task writes men: 1, so a row without one
    // is not a row somebody forgot to crew.
    expect(calcFieldTaskCost({ hrs: 8 }, crew)).toBe(0);
    expect(calcFieldTaskCost({ men: '', hrs: 8 }, crew)).toBe(0);
  });

  it('an explicit zero costs nothing, as it always did', () => {
    expect(calcFieldTaskCost({ men: 0, hrs: 8 }, crew)).toBe(0);
  });

  it('prices a crewed row the same as before', () => {
    expect(calcFieldTaskCost({ men: 2, hrs: 4 }, crew)).toBe(800);
  });
});

// ── AND THE BOX HAS TO SHOW IT BACK ──────────────────────────────────────────
// `value={t.men || 1}` redisplayed a stored 0 as 1 — the app overwriting an
// answer it had just been given. Asserted against the real screen, because a
// unit test on the cost function cannot see what the estimator is looking at.
describe('the Men box shows the zero the estimator typed', () => {
  const render = rackTasks => renderToStaticMarkup(
    <AuthProvider>
      <StateProvider initial={{
        ...initialState, mode: 'Commercial Refrigeration', racks: 1, rackTasks,
      }}>
        <Step3Rack onNext={() => {}} onBack={() => {}} />
      </StateProvider>
    </AuthProvider>,
  );

  const menBoxes = html => [...html.matchAll(/text-align:center[^"]*"\s+value="(\d*)"/g)].map(m => m[1]);

  it('renders a zeroed rack task without turning it back into a 1', () => {
    const out = render([{ id: 't1', desc: 'Set rack — GC scope', men: 0, hrs: 8 }]);
    expect(menBoxes(out)).toContain('0');
  });

  it('still shows 1 for a task that names nobody', () => {
    const out = render([{ id: 't1', desc: 'Set rack', hrs: 8 }]);
    expect(menBoxes(out)).toContain('1');
  });

  it('shows the crew a task does name', () => {
    const out = render([{ id: 't1', desc: 'Set rack', men: 4, hrs: 2 }]);
    expect(menBoxes(out)).toContain('4');
  });
});
