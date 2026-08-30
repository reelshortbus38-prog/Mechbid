# Regression corpus

Real jobs, with the answers a working estimator confirmed, run on every commit.

Every accuracy bug this app has had was found the same way: a real document was
uploaded, and someone who knew the trade noticed the number was wrong. That
works, and on its own it does not last — the knowledge lives in whoever
remembers the job. This directory is that knowledge written down so the test
suite re-checks it forever.

## The source documents are deliberately NOT here

This repository is public. The files these fixtures came from are a customer's:
Food Lion's store design, Williams & Rowe's engineering, a general contractor's
schedule, and the names of the technicians and salespeople on them. The app's
own Privacy Policy tells users that drawings "frequently belong to an owner,
architect or engineer and are often shared under confidentiality obligations" —
publishing a set here would break the first promise the product makes.

So each fixture carries the **extracted values and the correct answer**, not the
document. That keeps every bit of the regression value, runs in milliseconds,
and reads properly in a diff.

If you need to re-derive a fixture from an original, `provenance` says exactly
which file and which run it came from.

## What is in here

| Fixture | Job | Pins |
|---|---|---|
| `701-bpr.json` | Food Lion 701, Troutman NC | 10 new circuits, 1 riser-only, 4 coil-only, 5 marked-no-copper |
| `701-parts-rack.json` | 701 rack parts order | 10 lines, no legend rows |
| `701-parts-case-ends.json` | 701 case ends order | 6 lines, departments, split descriptions |
| `edmonds-pumps.json` | Edmonds SD College Place | motor selections against the engineer's own schedule |

## Adding a job

1. Run the real file through the parser and read the output.
2. Have somebody who knows the trade confirm the right answer — **that
   confirmation is the fixture's whole value**, not the parse.
3. Write the extracted values and the confirmed answer into a new JSON file.
4. Record in `provenance` who confirmed it and when.

A fixture nobody has checked against reality is a test that the code still does
what it did, which is not the same as doing the right thing.
