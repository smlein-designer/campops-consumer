/**
 * The planner against many DIFFERENT trips — not one demo story. A trip is
 * whatever the user asks for: just a campsite, a campsite plus activities,
 * a vague browse, anywhere in Texas. Each block states the behaviour and
 * checks it against the deterministic planner (no model, no network).
 */
import {
  acceptSuggestion,
  activeBookings,
  answerActivityQuestion,
  applyDates,
  applyTurn,
  changeActivity,
  clearTripFact,
  defaultActivityChoice,
  dismissSuggestion,
  dropCampsiteDecision,
  holdActivityChoice,
  holdSpecificCampsite,
  openActivitySlots,
  otherOptionsReply,
  skipActivityChoice,
  releaseBooking,
  removeTripRequirement,
  resolveHoldAsk,
  setRequirementTier,
  shownCampsite,
  widenTripSearch,
} from "../src/lib/v3/agent-loop";
import { existsSync } from "node:fs";
import { emptyTrip } from "../src/lib/v3/trip-factory";
import { campsitePhoto, headerSrc, sceneForSite, tripHeaderScene } from "../src/lib/v3/photos";
import { isBrowseOptionsMessage, needsYouAnswer } from "../src/lib/v3/clarification";
import { tripTotal } from "../src/lib/v3/money";
import { activityQuote, defaultActivityParty } from "../src/lib/v3/activity-choice";
import { campsiteById, driveHours, searchCampsites, searchOne, tripRange } from "../src/lib/v3/search";
import { tripFactChips, tripTitle } from "../src/lib/v3/booking-display";
import { ACTIVITIES_BY_ID, activitiesNear, activitySlots, providerForActivity } from "../src/lib/v3/providers";
import {
  chooseSlot,
  fireCampsiteUnavailable,
  fireForecastChange,
  fireHoldExpiry,
  otherTimes,
  resolveCampsiteUnavailableHold,
  resolveForecastDecision,
  scenarioBlockers,
  startDemoTrip,
} from "../src/lib/v3/scripted-events";
import { CAMPSITES } from "../src/lib/campsites";
import { normalizeAmenityLabel } from "../src/lib/amenities";
import { buildFitCard } from "../src/lib/v3/fit";
import { suggestionFor } from "../src/lib/v3/rules-suggestion";
import type { V3IntentExtraction } from "../src/lib/v3/intent-schema";
import type { Trip } from "../src/lib/v3/schemas";

let failures = 0;
function assert(condition: unknown, message: string) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}
function run(label: string, fn: () => void) {
  console.log(`\n=== ${label} ===`);
  fn();
}

const now = Date.now();
const NOTHING: V3IntentExtraction = {
  checkIn: null,
  checkOut: null,
  dateHint: null,
  adults: null,
  children: null,
  pets: null,
  destination: null,
  origin: null,
  driveLimitHours: null,
  budgetTotalUsd: null,
  budgetPerNightUsd: null,
  requirements: [],
  status: "actionable",
  clarificationQuestion: null,
  clarificationOptions: null,
  unsupportedReason: null,
  candidateQuestion: null,
};
/** Takes the recommended campsite when CampOps asks the traveler to choose one. */
function pickCampsite(trip: Trip): Trip {
  const item = trip.needsYouQueue[0];
  return item?.kind === "campsite_choice" ? holdSpecificCampsite(trip, item.payload!.campsiteId!, now).trip : trip;
}
/** A turn, then the traveler picks the recommended site if asked (the older tests' shorthand). */
const say = (trip: Trip, said: Partial<V3IntentExtraction>, message = "") => {
  const result = applyTurn(trip, { ...NOTHING, ...said }, now, message);
  return { ...result, trip: pickCampsite(result.trip) };
};
// A hold limit high enough that only the permission tests run into it.
const roomy = (): Trip => ({
  ...emptyTrip(),
  permissions: emptyTrip().permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 1000 } : p)),
});
/** Takes every activity choice as offered: its first open time, everyone who fits. */
function pickAll(trip: Trip): Trip {
  let next = trip;
  for (let i = 0; i < 8; i++) {
    const item = next.needsYouQueue[0];
    if (item?.kind !== "activity_choice") break;
    const choice = defaultActivityChoice(next, item.payload!.activityId)!;
    next = holdActivityChoice(next, item.id, choice.slot, choice.party, now).trip;
  }
  return next;
}
const start = (said: Partial<V3IntentExtraction>) => pickAll(say(roomy(), said).trip);
const held = (trip: Trip) => activeBookings(trip);
const site = (trip: Trip) => campsiteById(trip.bookings.find((b) => b.kind === "campsite")?.refId ?? "");

const LAKE_WEEKEND: Partial<V3IntentExtraction> = {
  checkIn: "Apr 16",
  checkOut: "Apr 18",
  adults: 4,
  pets: 1,
  origin: "Austin",
  driveLimitHours: 2,
  budgetTotalUsd: 800,
  requirements: [
    { label: "On the water", tier: "nice" },
    { label: "Boat rental", tier: "nice" },
    { label: "Beginner trail ride", tier: "nice" },
    { label: "Guided hike", tier: "nice" },
  ],
};

run("Campsite plus activities, asked for up front: one step each, all held", () => {
  const trip = start(LAKE_WEEKEND);
  assert(trip.plan.length === 4, `the plan has a step per thing asked for, got ${trip.plan.length}`);
  assert(site(trip)?.id === "pine-hollow-14", `Pine Hollow is the pick, got ${site(trip)?.id}`);
  assert(held(trip).length === 4, `four bookings held, got ${held(trip).length}`);
  assert(tripTotal(held(trip)) === 642, `the total is computed as $642, got ${tripTotal(held(trip))}`);
  const slots = held(trip).filter((b) => b.time).map((b) => `${b.day} ${b.time}`);
  assert(new Set(slots).size === 3, "no two activities share a time");
  assert(trip.agent.phase === "complete" && trip.needsYouQueue.length === 0, "it ends ready to book, waiting on nothing");
  assert(tripTitle(trip, site(trip)) === "Lake weekend, Hill Country", `the banner names the trip, got "${tripTitle(trip, site(trip))}"`);
  assert(trip.suggestions.filter((s) => s.state === "offered").length === 1, "one extra is offered once the plan settles");
});

run("Activities wait for the user's pick of time and who's going", () => {
  const trip = say(roomy(), LAKE_WEEKEND).trip;
  const item = trip.needsYouQueue[0];
  assert(item?.kind === "activity_choice", `the first activity asks for a time, got ${item?.kind}`);
  assert(held(trip).length === 1 && held(trip)[0].kind === "campsite", "only the campsite is held — no activity time was picked for the user");
  const activity = ACTIVITIES_BY_ID[item.payload!.activityId];
  const slots = openActivitySlots(trip, activity);
  assert(slots.length > 1, `there are real times to choose from, got ${slots.length}`);

  const later = slots[slots.length - 1];
  const picked = holdActivityChoice(trip, item.id, later, { adults: 2, children: 0 }, now).trip;
  const booking = held(picked).find((b) => b.refId === activity.id)!;
  assert(booking?.day === later.date && booking.time === `${later.startTime}-${later.endTime}`, "the time held is the one the user picked");
  assert(booking.party?.adults === 2 && booking.party.children === 0, "and so is who's going");
  assert(picked.events.some((e) => e.actor === "You" && e.kind === "hold"), "the record shows it was the user's choice");
  assert(picked.needsYouQueue[0]?.kind === "activity_choice" && picked.needsYouQueue[0].payload?.activityId !== activity.id, "then the next activity asks");

  const skipped = skipActivityChoice(picked, picked.needsYouQueue[0].id, now).trip;
  assert(skipped.plan.some((s) => s.detail === "Skipped"), "an activity can be skipped");
  assert(item.primaryLabel === "Pick a time" && !item.secondaryLabel, "the decision card points to the times, not one time or nothing");
});

run("Asking about activities answers from what's near the site", () => {
  let trip = say(roomy(), LAKE_WEEKEND).trip;
  // Skip every activity, then ask for one back.
  for (let i = 0; i < 4 && trip.needsYouQueue[0]?.kind === "activity_choice"; i++) {
    trip = skipActivityChoice(trip, trip.needsYouQueue[0].id, now).trip;
  }
  const offeredBack = trip.suggestions.find((s) => s.state === "offered");
  assert(offeredBack?.target.kind !== "activity" || ACTIVITIES_BY_ID[offeredBack.target.id].type !== "boat", "a skipped boat isn't pushed again as a suggestion");
  const boatBack = answerActivityQuestion(trip, "any boats to rent?")?.trip;
  const offered = boatBack?.needsYouQueue[0];
  assert(offered?.kind === "activity_choice" && ACTIVITIES_BY_ID[offered.payload!.activityId].type === "boat", "a skipped boat can be asked for again");
  assert(answerActivityQuestion(trip, "no boat please") === null, "saying no to one isn't an ask for it");

  const list = answerActivityQuestion(trip, "any activities?")?.trip.clarifyingQuestion;
  const nearIds = activitiesNear(site(trip)!).map((a) => a.id);
  assert(!!list && list.options.length > 0 && list.options.every((o) => nearIds.includes(o.activityId!)), "the activities listed are only ones near the site");

  const dry = start({ destination: "Hill Country", checkIn: "Dec 4", checkOut: "Dec 6", adults: 2 });
  const dryAnswer = !site(dry)!.waterAccess.nearby ? answerActivityQuestion(dry, "can we rent a pontoon?") : null;
  if (dryAnswer) assert(dryAnswer.trip.needsYouQueue.length === 0 && /no boat/i.test(dryAnswer.factsToPhrase[0]), `a boat isn't offered at a dry site, got "${dryAnswer.factsToPhrase[0]}"`);

  const settled = say(dry, { status: "needs_clarification", clarificationQuestion: "How many people are going?", clarificationOptions: ["2", "4"] }, "People").trip;
  assert(settled.clarifyingQuestion === null, "a settled trip doesn't re-ask what it already knows");
});

run("Activity times can be changed", () => {
  const trip = say(roomy(), LAKE_WEEKEND).trip;
  const ride = ACTIVITIES_BY_ID["hcr-beginner-trail"];
  const sixOf = defaultActivityParty(ride, { ...trip.intent, adults: 4, children: 2 });
  assert(sixOf.adults + sixOf.children === ride.capacity, `a ride never offers more riders than it has horses (${ride.capacity})`);
  const kayaks = ACTIVITIES_BY_ID["lakeshore-kayaks"];
  assert(activityQuote(kayaks, { adults: 3, children: 1 }).price === kayaks.price * 2, "four people on kayaks for two need two kayaks");

  const family = start(LAKE_WEEKEND);
  const rideBooking = held(family).find((b) => b.refId === ride.id)!;
  assert(rideBooking.price === ride.price * 4, `riders are priced each, got $${rideBooking.price}`);

  const moveTo = openActivitySlots(family, ride, rideBooking.id).find((s) => s.date !== rideBooking.day || `${s.startTime}-${s.endTime}` !== rideBooking.time)!;
  const changed = changeActivity(family, rideBooking.id, moveTo, { adults: 1, children: 1 }, now).trip;
  const after = held(changed).find((b) => b.id === rideBooking.id)!;
  assert(after.day === moveTo.date && after.price === ride.price * 2 && after.status === "held", "a held activity can change time and riders and stays held");
});

run("Just a campsite: a one-step plan, then one gentle nudge", () => {
  const trip = start({ destination: "Hill Country", checkIn: "May 7", checkOut: "May 9", adults: 2, requirements: [{ label: "Quiet", tier: "must" }] });
  assert(trip.plan.length === 1, `the plan is only the campsite, got ${trip.plan.length} steps`);
  assert(held(trip).length === 1 && held(trip)[0].kind === "campsite", "only a campsite is held — no activity was assumed");
  assert(trip.suggestions.filter((s) => s.state === "offered").length <= 1, "at most one suggestion is offered");
  const offered = trip.suggestions.find((s) => s.state === "offered");
  if (offered?.target.kind === "activity") {
    const near = activitiesNear(site(trip)!).some((a) => a.id === offered.target.id);
    assert(near, "the suggested activity really is near this campsite");
  }
  assert(!tripTitle(trip).includes("Lake"), `the banner doesn't call it a lake trip, got "${tripTitle(trip)}"`);
});

run("No site appears until where, dates and party size are known", () => {
  const nowhere = start({ pets: 1, requirements: [{ label: "Lake", tier: "must" }] });
  assert(nowhere.plan.length === 1, "the plan is visible straight away");
  assert(!nowhere.campsiteComparison && held(nowhere).length === 0, "no site is picked for the user from anywhere in the state");
  assert(nowhere.pendingAsk?.kind === "destination", `it asks where first, got ${nowhere.pendingAsk?.kind}`);
  const allButWhere = start({ checkIn: "Dec 4", checkOut: "Dec 6", adults: 4, children: 2, pets: 1 });
  assert(held(allButWhere).length === 0 && allButWhere.pendingAsk?.kind === "destination", "even with dates and party size, nothing is held until it knows where");
  assert(!tripTitle(allButWhere).includes("Hill Country"), `the trip isn't named after a place nobody said, got "${tripTitle(allButWhere)}"`);

  const trip = say(nowhere, {}, "Austin").trip;
  assert(!!(trip.intent.destination || trip.intent.origin), "a bare city answers where");
  assert(!trip.campsiteComparison && held(trip).length === 0, "no site is shown or held without dates");
  assert(trip.plan[0].detail === "Needs your dates", `the plan says what it's waiting on, got "${trip.plan[0].detail}"`);
  assert(trip.pendingAsk?.kind === "dates", `the open question is the dates, got ${trip.pendingAsk?.kind}`);

  const dated = say(trip, { checkIn: "Jun 11", checkOut: "Jun 13" }).trip;
  assert(!dated.campsiteComparison && held(dated).length === 0, "still no site with dates but no party size");
  assert(dated.pendingAsk?.kind === "party_size", "with dates known, it asks who's coming next");

  const sized = say({ ...dated }, {}, "3").trip;
  assert(held(sized).length === 1, "a bare \"3\" answers the party question, and only then is a site shown and held");
  assert(sized.intent.adults === 3, `party size is read from the reply, got ${sized.intent.adults}`);

  const noOrigin = start({ checkIn: "Jun 11", checkOut: "Jun 13", adults: 2, driveLimitHours: 2 });
  assert(!noOrigin.campsiteComparison && noOrigin.pendingAsk?.kind === "origin", "a drive limit with no starting point shows no site yet");
});

run("A browsing question can see a site before dates, once it has an area", () => {
  const browse = say(roomy(), { destination: "Hill Country", requirements: [{ label: "Quiet", tier: "must" }] }, "What are some quiet campgrounds in Hill Country?").trip;
  assert(browse.browsing && !!browse.campsiteComparison, "a browse with an area shows a site");
  assert(held(browse).length === 0 && browse.pendingAsk?.kind === "dates", "but holds nothing until dates and party size");
  const vague = say(roomy(), { requirements: [{ label: "Quiet", tier: "must" }] }, "What are some quiet campgrounds?").trip;
  assert(!vague.campsiteComparison && vague.pendingAsk?.kind === "destination", "a browse with no area asks where first");
});

run('"Sometime in April": weekend choices, an assumption, and the plan keeps going', () => {
  const trip = start({ destination: "Hill Country", dateHint: "sometime in April", adults: 2, requirements: [{ label: "On the water", tier: "must" }] });
  const card = trip.clarifyingQuestion;
  assert(!!card && /April/.test(card.question), `it asks which weekend in April, got "${card?.question}"`);
  assert((card?.options.length ?? 0) >= 3 && !!card?.options[0].checkIn, "the options are real weekends");
  assert(/for now/.test(card?.assumption ?? ""), "it says which weekend it is assuming meanwhile");
  assert(!trip.campsiteComparison && held(trip).length === 0, "no site is named for a weekend that isn't confirmed");
  assert(/campsites fit so far/.test(trip.plan[0].detail), `the plan shows the search under way, got "${trip.plan[0].detail}"`);
  assert(tripFactChips(trip.intent).some((c) => c.label === "April"), "April shows in what it heard");

  const option = card!.options[1];
  const dated = applyDates(trip, option.checkIn!, option.checkOut!, now).trip;
  assert(dated.clarifyingQuestion === null && dated.needsYouQueue[0]?.kind === "campsite_choice", "tapping a weekend settles it, and the sites that fit are offered to choose from");
  assert(held(pickCampsite(dated)).length === 1, "picking one holds it");
});

run('"First weekend in December" is an answer, not a question', () => {
  const trip = start({ destination: "Hill Country", dateHint: "first weekend in December", adults: 2, requirements: [{ label: "On the water", tier: "must" }] });
  assert(trip.clarifyingQuestion === null, `it doesn't ask which weekend, got "${trip.clarifyingQuestion?.question}"`);
  assert(!trip.intent.dateHint && !!tripRange(trip.intent), "the named weekend becomes real dates");
  const range = tripRange(trip.intent)!;
  assert(new Date(`${range.startISO}T12:00:00`).getDay() === 5 && range.nights === 2, `it's that Friday to Sunday, got ${range.startISO}`);
});

run('"Other options": the list, and a question only when few sites fit', () => {
  assert(isBrowseOptionsMessage("other site options") && isBrowseOptionsMessage("more options"), "asking for other or more options is understood");
  assert(!isBrowseOptionsMessage("a different site"), "asking for a different site still swaps it");
  const open = start({ destination: "Hill Country", checkIn: "Dec 4", checkOut: "Dec 6", adults: 2 });
  const plenty = otherOptionsReply(open);
  assert(plenty.question === null && /other sites fit/.test(plenty.line), `plenty of fits: just the list, got "${plenty.line}"`);
  // Only one other site still open.
  const water = start({ destination: "Hill Country", checkIn: "Dec 4", checkOut: "Dec 6", adults: 2, requirements: [{ label: "On the water", tier: "must" }] });
  const pickId = site(water)?.id;
  const others = searchCampsites(water).candidates.map((c) => c.campsite.id).filter((id) => id !== pickId);
  const narrow: Trip = { ...water, unavailableCampsiteIds: others.slice(1) };
  const few = otherOptionsReply(narrow);
  assert(!!few.question && few.question.options.every((o) => o.relaxRequirementId || o.dropDriveLimit), `few fits: it asks what to loosen, got "${few.line}"`);
  const relaxed = setRequirementTier(narrow, few.question!.options[0].relaxRequirementId!, "nice", now).trip;
  assert(searchCampsites(relaxed).candidates.length >= searchCampsites(narrow).candidates.length, "loosening one shows at least as many sites");
});

run("Going to the other options clears the open campsite decision", () => {
  const tight: Trip = { ...emptyTrip(), permissions: emptyTrip().permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 50 } : p)) };
  const asked = say(tight, { destination: "Hill Country", checkIn: "Dec 4", checkOut: "Dec 6", adults: 2 }).trip;
  assert(asked.needsYouQueue[0]?.kind === "hold_ask", `an over-limit site asks first, got ${asked.needsYouQueue[0]?.kind}`);
  const browsing = dropCampsiteDecision(asked);
  assert(browsing.needsYouQueue.length === 0 && browsing.agent.currentStepText === "choosing a campsite", "once the user goes to the list, the alert is gone");
});

run("Every campsite has its own photo, and the header follows the landscape", () => {
  const paths = CAMPSITES.map((c) => campsitePhoto(c));
  assert(new Set(paths).size === CAMPSITES.length, "no two campsites share a photo");
  const missing = paths.filter((p) => !existsSync(`public${p}`));
  assert(missing.length === 0, `every campsite photo is in the project, missing: ${missing.join(", ")}`);
  const scenes = CAMPSITES.map((c) => headerSrc(sceneForSite(c)));
  const missingHeaders = [...new Set(scenes), headerSrc("camping-anywhere"), headerSrc("dark-skies")].filter((p) => !existsSync(`public${p}`));
  assert(missingHeaders.length === 0, `every header scene is in the project, missing: ${missingHeaders.join(", ")}`);

  const nowhere = start({ checkIn: "Dec 4", checkOut: "Dec 6", adults: 2 });
  assert(tripHeaderScene(nowhere.intent, shownCampsite(nowhere)) === "camping-anywhere", "before anywhere is known, the header is a neutral camping scene");
  const canyon = CAMPSITES.find((c) => c.id === "palo-duro-canyon-5")!;
  assert(sceneForSite(canyon) === "panhandle-canyon", "a canyon site gets the canyon header, not a lake");
  const lake = CAMPSITES.find((c) => c.id === "pine-hollow-14")!;
  assert(sceneForSite(lake) === "hill-country-lake", "a Hill Country lake site keeps the lake header");
  const river = CAMPSITES.find((c) => c.id === "pedernales-falls-6")!;
  assert(sceneForSite(river) === "hill-country-river", "a river site gets the river header");
  const stars = say(nowhere, { requirements: [{ label: "Stargazing", tier: "nice" }] }).trip;
  assert(tripHeaderScene(stars.intent, shownCampsite(stars)) === "dark-skies", "a stargazing trip gets the night sky");
});

run("Dark skies: only remote, open sites, and the request finds them", () => {
  const darkSites = CAMPSITES.filter((c) => c.amenities.includes("stargazing"));
  assert(darkSites.length >= 3, `several sites offer stargazing, got ${darkSites.map((c) => c.id).join(", ")}`);
  assert(
    darkSites.every((c) => c.seclusion === "high" && c.noiseLevel === "low" && !/wooded|shaded|trees|pines|cypress/i.test(`${c.siteType} ${c.description}`)),
    "every one is secluded, quiet and open to the sky",
  );
  assert(normalizeAmenityLabel("Dark skies") === "stargazing", '"dark skies" means stargazing');
  const trip = start({ destination: "West Texas", checkIn: "Dec 4", checkOut: "Dec 6", adults: 2, requirements: [{ label: "Dark skies", tier: "must" }] });
  const picked = site(trip);
  assert(!!picked && picked.amenities.includes("stargazing"), `a dark-skies trip holds a stargazing site, got ${picked?.id}`);
});

run("A site with none of what was asked for is never an option", () => {
  // "Good vibes" can't be checked anywhere; "Stargazing" can, and only a few sites have it.
  const trip = start({
    destination: "Hill Country",
    checkIn: "Dec 4",
    checkOut: "Dec 6",
    adults: 2,
    requirements: [{ label: "Good vibes", tier: "must" }, { label: "Stargazing", tier: "nice" }],
  });
  const result = searchCampsites(trip);
  assert(result.candidates.length > 0, "the sites that have stargazing are still options");
  assert(result.candidates.every((c) => c.campsite.amenities.includes("stargazing")), `every option has something asked for, got ${result.candidates.map((c) => c.campsite.id).join(", ")}`);
  const vague = searchCampsites({ ...trip, intent: { ...trip.intent, requirements: trip.intent.requirements.filter((r) => r.label === "Good vibes") } });
  assert(vague.candidates.length > 1, "a request nothing can check doesn't empty the list on its own");
  const card = buildFitCard(result, "enchanted-rock-2", trip.intent, "Option");
  assert(!!card?.fit.some((r) => r.state === "kept" && r.requirement === "Stargazing"), "the card shows the nice-to-have the site has");
  const prairie = searchOne(trip, "prairie-flats-22").candidates[0];
  assert(!!prairie, "a site's own details still judge it, even when it has none of the requests");
});

run("Demo scenarios: the story starts in one tap, and weather always finds a held activity", () => {
  const demo = startDemoTrip(roomy(), now).trip;
  assert(demo.needsYouQueue[0]?.kind === "campsite_choice" && held(demo).length === 0, "the demo trip offers campsites to choose from");
  const demoPicked = pickCampsite(demo);
  assert(held(demoPicked).some((b) => b.kind === "campsite") && demoPicked.needsYouQueue[0]?.kind === "activity_choice", "once a site is picked, it asks for the first activity's time");
  assert(scenarioBlockers(emptyTrip()).campsiteUnavailable !== null, "with no trip, the site-taken scenario says why it can't run");

  // Hold every activity at its LAST open time, so none sits in a fixed afternoon storm.
  let trip = start(LAKE_WEEKEND);
  for (const b of held(trip).filter((x) => x.kind === "activity")) {
    const slots = openActivitySlots(trip, ACTIVITIES_BY_ID[b.refId], b.id);
    trip = changeActivity(trip, b.id, slots[slots.length - 1], b.party!, now).trip;
  }
  const stormy = fireForecastChange(trip, now).trip;
  assert(stormy.needsYouQueue.some((n) => n.kind === "forecast_move"), "the storm lands on a held activity, so something moves and CampOps asks");
  assert(scenarioBlockers(stormy).forecast !== null, "it only happens once per trip");
});

run("Kayaks booked one way are never offered again the other way", () => {
  const pineHollow = CAMPSITES.find((c) => c.id === "pine-hollow-14")!;
  const permissions = emptyTrip().permissions;
  const kayakActivity = activitiesNear(pineHollow).find((a) => a.type === "kayak")!;
  const others = activitiesNear(pineHollow).filter((a) => a.type !== "kayak").map((a) => a.id);
  const afterActivity = suggestionFor({ campsite: pineHollow, dismissedTypes: [], permissions, hasPendingDecision: false, bookedIds: [kayakActivity.id, ...others, "firewood-bundle"] });
  assert(afterActivity?.target.id !== "kayak-rental", `with kayaks held, the camp-store kayak rental isn't offered, got ${afterActivity?.target.id}`);
  const afterAddOn = suggestionFor({ campsite: pineHollow, dismissedTypes: [], permissions, hasPendingDecision: false, bookedIds: ["kayak-rental", ...others] });
  assert(afterAddOn?.target.id !== kayakActivity.id, `with the kayak rental held, the kayak activity isn't offered, got ${afterAddOn?.target.id}`);
  const afterNo = suggestionFor({ campsite: pineHollow, dismissedTypes: ["kayak"], permissions, hasPendingDecision: false, bookedIds: [...others, "firewood-bundle"] });
  assert(afterNo?.target.id !== "kayak-rental", "saying no to kayaks covers the rental too");
});

run("A chat reply answers the open Needs You card", () => {
  const weather = { primaryLabel: "Keep Saturday", secondaryLabel: "Other options" };
  assert(needsYouAnswer(weather, "keep saturday") === "primary", "the button's own words pick that button");
  assert(needsYouAnswer(weather, "Yes, that's fine.") === "primary", "a plain yes picks the main answer");
  assert(needsYouAnswer(weather, "show me other options") === "secondary", "other options picks the second answer");
  const limit = { primaryLabel: "Hold · $390", secondaryLabel: "Other options" };
  assert(needsYouAnswer(limit, "hold it") === "primary" && needsYouAnswer(limit, "no thanks") === "secondary", "hold it / no thanks answer an over-limit ask");
  assert(needsYouAnswer(limit, "how far is it from Austin?") === null, "a question about something else leaves the card open");
});

run("CampOps offers its top three campsites and holds nothing until you pick", () => {
  const offered = applyTurn(roomy(), { ...NOTHING, ...LAKE_WEEKEND }, now).trip;
  const choice = offered.needsYouQueue[0];
  assert(choice?.kind === "campsite_choice", `the traveler is asked to choose, got ${choice?.kind}`);
  assert(held(offered).length === 0, "nothing is held before they choose");
  const cards = offered.campsiteComparison;
  assert(cards?.recommended.eyebrow === "Recommended" && (cards.options?.length ?? 0) === 2, "the best fit is Recommended, with two more beside it");
  assert(cards!.options!.every((o) => o.eyebrow === "Option"), "the others are labeled Option");

  // Picking the second option holds that one, and the plan moves on.
  const second = cards!.options![0].campsiteId;
  const picked = holdSpecificCampsite(offered, second, now).trip;
  assert(site(picked)?.id === second, "the site the traveler picked is the one held");
  assert(!picked.needsYouQueue.some((n) => n.kind === "campsite_choice"), "the choice is answered");
  assert(picked.needsYouQueue[0]?.kind === "activity_choice", "and the plan moves on to the next step");

  // Releasing the held campsite goes back to the choice, not on to activities.
  const campsite = picked.bookings.find((b) => b.kind === "campsite")!;
  const back = releaseBooking(picked, campsite.id, now).trip;
  assert(held(back).length === 0, "releasing the campsite leaves nothing held");
  assert(back.needsYouQueue.length === 1 && back.needsYouQueue[0].kind === "campsite_choice", `the traveler is asked to pick a campsite again, got ${back.needsYouQueue.map((n) => n.kind).join(", ")}`);
  assert((back.campsiteComparison?.options?.length ?? 0) === 2, "the three campsites are shown again");
  const steps = back.plan.filter((s) => s.id === "step-campsite" || s.id.startsWith("step-activity-"));
  assert(steps.every((s) => s.status !== "done"), "no campsite or activity step is marked done");
});

run("Nothing to go on: it asks for more instead of guessing", () => {
  const trip = start({});
  assert(trip.pendingAsk?.kind === "more_detail" && !trip.campsiteComparison, "no recommendation is made from nothing");
});

run("The drive limit is enforced, and No Match loosens exactly one thing", () => {
  const near = start({ ...LAKE_WEEKEND, driveLimitHours: 1.25 });
  const hours = driveHours(near.intent, site(near)!);
  assert(hours != null && hours <= 1.25, `the held site is within the limit, got ${hours?.toFixed(2)} hrs`);

  const none = start({ ...LAKE_WEEKEND, driveLimitHours: 0.25 });
  assert(held(none).length === 0 && none.needsYouQueue[0]?.kind === "no_match", "an impossible drive is a No Match, not a silent miss");
  assert(/Allow up to 0.75 hrs/.test(none.needsYouQueue[0].primaryLabel), `the button says what it would loosen, got "${none.needsYouQueue[0].primaryLabel}"`);
  const widened = widenTripSearch(none, now).trip;
  assert(widened.intent.driveLimitHours === 0.75, "widening raises the drive by half an hour, nothing else");

  const noOrigin = start({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, driveLimitHours: 2, requirements: [{ label: "Lake", tier: "nice" }] });
  assert(noOrigin.pendingAsk?.kind === "origin" && held(noOrigin).length === 0, "a drive limit with no starting point asks where from");
  const answered = say(noOrigin, {}, "Austin").trip;
  assert(answered.intent.origin === "Austin" && held(answered).length === 1, "a bare city answers it");
});

run("A whole-trip budget limits the stay; activities are the user's call", () => {
  const trip = say(roomy(), { ...LAKE_WEEKEND, budgetTotalUsd: 300 }).trip;
  assert(tripTotal(held(trip)) <= 300, `held bookings stay inside the budget, got $${tripTotal(held(trip))}`);
  assert(trip.needsYouQueue[0]?.kind === "activity_choice", "an activity waits for the user rather than being held");
  const skipped = skipActivityChoice(trip, trip.needsYouQueue[0].id, now).trip;
  assert(tripTotal(held(skipped)) <= 300, "skipping it keeps the trip inside the budget");
});

run("Kids make a family-friendly site a preference, once", () => {
  const trip = start({ destination: "Hill Country", checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, children: 2 });
  assert(trip.intent.requirements.some((r) => r.label === "Family-friendly" && r.tier === "nice"), "it is added as a nice-to-have");
  const family = trip.intent.requirements.find((r) => r.label === "Family-friendly")!;
  const removed = removeTripRequirement(trip, family.id, now).trip;
  const later = say(removed, { requirements: [{ label: "Showers", tier: "nice" }] }).trip;
  assert(!later.intent.requirements.some((r) => r.label === "Family-friendly"), "once removed, it isn't forced back in");
});

run("A destination keeps the search there, and activities come from providers that are really nearby", () => {
  const west = start({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, destination: "West Texas", requirements: [{ label: "Trail ride", tier: "must" }] });
  assert(site(west)?.region === "West Texas", `the site is in West Texas, got ${site(west)?.region}`);
  const ride = held(west).find((b) => b.kind === "activity");
  assert(!!ride && ride.provider !== "Hill Country Trail Rides", `the ride is from a local stable, got ${ride?.provider}`);

  const gulf = start({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, destination: "Galveston", requirements: [{ label: "Boat rental", tier: "nice" }] });
  assert(held(gulf).length === 1, "where no boat rental is nearby, none is booked");
  assert(gulf.plan.find((s) => s.id === "step-activity-boat")?.detail.startsWith("Not offered"), "and the plan says so");

  for (const campsite of CAMPSITES) {
    for (const activity of activitiesNear(campsite)) {
      const p = providerForActivity(activity);
      const miles = Math.hypot((p.latitude - campsite.latitude) * 69, (p.longitude - campsite.longitude) * 59);
      if (miles > 35) assert(false, `${activity.name} at ${p.name} is offered ${Math.round(miles)} mi from ${campsite.campgroundName}`);
    }
  }
  assert(CAMPSITES.some((c) => activitiesNear(c).length === 0), "some campsites honestly have nothing nearby");
});

run("Activity times follow the trip's own dates", () => {
  const trip = start({ ...LAKE_WEEKEND, checkIn: "Jun 11", checkOut: "Jun 14" });
  const range = tripRange(trip.intent)!;
  const days = held(trip).filter((b) => b.time).map((b) => b.day);
  assert(days.length === 3 && days.every((d) => d >= range.startISO && d <= range.endISO), `every activity falls inside ${range.startISO}..${range.endISO}`);
  const pontoon = ACTIVITIES_BY_ID["lakeshore-pontoon"];
  assert(activitySlots(pontoon, { startISO: "2027-04-17", nights: 1 }).every((s) => s.date >= "2027-04-17"), "a one-night trip still gets real slots");
});

run("Switching site re-checks what depends on it: the boat goes, the rest stays", () => {
  const trip = start(LAKE_WEEKEND);
  const { trip: switched, factsToPhrase } = holdSpecificCampsite(trip, "prairie-flats-22", now);
  assert(site(switched)?.id === "prairie-flats-22", "the new site is held");
  assert(!held(switched).some((b) => b.category === "Pontoon"), "the pontoon is released — Prairie Flats has no water");
  assert(held(switched).some((b) => b.category === "Horseback") && held(switched).some((b) => b.category === "Guided hike"), "the ride and the hike still fit and stay held");
  assert(tripTotal(held(switched)) === 410, `the total drops to $410, got $${tripTotal(held(switched))}`);
  assert(factsToPhrase.some((f) => /isn't on the water/.test(f) && /Nothing was charged/.test(f)), "it says why, out loud");

  // A site the user names is their call, even when it misses a must-have.
  const strict = start({ ...LAKE_WEEKEND, requirements: [{ label: "On the water", tier: "must" }, { label: "Boat rental", tier: "nice" }] });
  const chosen = holdSpecificCampsite(strict, "prairie-flats-22", now);
  assert(site(chosen.trip)?.id === "prairie-flats-22", "a named site is held even though it misses a must-have");
  assert(chosen.factsToPhrase.some((f) => /except: On the water/.test(f)), "and it says which must-have that choice gives up");
  const later = say(chosen.trip, { budgetTotalUsd: 900 }).trip;
  assert(site(later)?.id === "prairie-flats-22", "a later, unrelated change doesn't undo the user's choice");
  const showers = say(chosen.trip, { requirements: [{ label: "Showers", tier: "must" }] }).trip;
  assert(site(showers)?.id !== "prairie-flats-22", "but a new must-have it misses does release it");
});

run("Weather: whatever is outdoors in the storm is moved, and it asks", () => {
  const trip = start(LAKE_WEEKEND);
  const { trip: stormy } = fireForecastChange(trip, now);
  const item = stormy.needsYouQueue[0];
  const moved = stormy.bookings.find((b) => b.id === item?.payload?.bookingId);
  assert(item?.kind === "forecast_move" && moved?.status === "changed_needs_ok", "the affected booking is moved and waits for an OK");
  assert(!!moved?.movedFrom && moved.day !== moved.movedFrom.day, "it moved off the stormy day");
  assert(fireForecastChange(stormy, now).trip === stormy, "firing again changes nothing");

  const times = otherTimes(stormy, moved!.id);
  assert(times[0]?.primary && times[times.length - 1]?.action === "Keep anyway", "other times list the current pick first and the original last");
  const kept = resolveForecastDecision(stormy, item.id, now).trip;
  assert(kept.bookings.find((b) => b.id === moved!.id)?.status === "held" && kept.needsYouQueue.length === 0, "keeping the move settles it");
  const chosen = chooseSlot(stormy, item.id, times[times.length - 1].slot, now).trip;
  assert(chosen.bookings.find((b) => b.id === moved!.id)?.day === moved!.movedFrom!.day, "or the user can keep the original time anyway");

  const campOnly = start({ destination: "Hill Country", checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, requirements: [{ label: "Quiet", tier: "must" }] });
  const calm = fireForecastChange(campOnly, now);
  assert(calm.trip.needsYouQueue.length === 0 && calm.factsToPhrase.length === 1, "a trip with nothing outdoors just hears about it");

  const houston = start({ checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, destination: "Houston", requirements: [{ label: "Boat rental", tier: "must" }] });
  const elsewhere = fireForecastChange(houston, now).trip;
  assert(elsewhere.needsYouQueue[0]?.kind === "forecast_move", "it works for a different marina in a different region");
});

run("A hold running out is re-held within the rules, or asked about", () => {
  const trip = start(LAKE_WEEKEND);
  const before = trip.holds.length;
  const reheld = fireHoldExpiry(trip, now);
  assert(reheld.trip.holds.length === before && reheld.trip.needsYouQueue.length === 0, "within the rules it is held again without asking");
  assert(/Nothing to do/.test(reheld.factsToPhrase[0]), "and says so in one line");

  const strict: Trip = { ...trip, permissions: trip.permissions.map((p) => (p.id === "rehold_on_expiry" ? { ...p, enabled: false } : p)) };
  const asked = fireHoldExpiry(strict, now).trip;
  assert(asked.needsYouQueue[0]?.kind === "hold_expired", "with re-holding off, it asks");
  const campOnly = start({ destination: "Hill Country", checkIn: "Apr 16", checkOut: "Apr 18", adults: 2, requirements: [{ label: "Quiet", tier: "must" }] });
  assert(fireHoldExpiry(campOnly, now).factsToPhrase.length === 1, "it works on a campsite-only trip too");
});

run("A lost campsite: the loss first, then a recommendation that waits for a yes", () => {
  const trip = start(LAKE_WEEKEND);
  const lostId = site(trip)!.id;
  const { trip: lost, factsToPhrase } = fireCampsiteUnavailable(trip, now);
  assert(/booked by someone else/.test(factsToPhrase[0]), "the loss is said first");
  assert(!held(lost).some((b) => b.kind === "campsite"), "the lost site is no longer held");
  assert(lost.needsYouQueue[0]?.kind === "campsite_unavailable", "a replacement is recommended, not silently held");
  assert(!!lost.campsiteComparison?.lost && lost.campsiteComparison.recommended.fit.length > 0, "the replacement shows what it keeps and trades off");
  assert(held(lost).length === 3, "the activities stay held while the user decides");

  const accepted = resolveCampsiteUnavailableHold(lost, lost.needsYouQueue[0].id, now).trip;
  assert(!!site(accepted) && site(accepted)!.id !== lostId, "accepting holds the replacement");
  assert(!searchCampsites(accepted).candidates.some((c) => c.campsite.id === lostId), "the lost site never comes back");
  assert(accepted.needsYouQueue.length === 0, "and nothing is left waiting");
});

run("Permissions: over the hold limit asks first; a yes holds it", () => {
  const cautious: Trip = { ...emptyTrip(), permissions: emptyTrip().permissions.map((p) => (p.id === "hold_refundable" ? { ...p, limitUsd: 100 } : p)) };
  const trip = say(cautious, LAKE_WEEKEND).trip;
  const item = trip.needsYouQueue[0];
  assert(item?.kind === "hold_ask" && /over your \$100 rule/.test(item.message), "the $168 campsite is over a $100 rule, so it asks");
  assert(held(trip).length === 0, "nothing over the limit was held on its own");
  const okd = resolveHoldAsk(trip, item.id, true, now).trip;
  assert(held(okd).some((b) => b.kind === "campsite" && b.price === 168), "the user's yes holds it");
  assert(okd.events.some((e) => e.actor === "You" && e.kind === "hold"), "and the record shows the user approved it");
});

run("Suggestions: never added without a yes; a dismissed kind doesn't come back", () => {
  const trip = start(LAKE_WEEKEND);
  const offered = trip.suggestions.find((s) => s.state === "offered")!;
  assert(held(trip).length === 4, "an offered suggestion is not in the plan or the total");
  const added = pickAll(acceptSuggestion(trip, offered.id, now).trip);
  assert(held(added).length === 5, "a yes adds it");
  const dismissed = dismissSuggestion(trip, offered.id);
  const next = dismissed.suggestions.find((s) => s.state === "offered");
  assert(!next || next.id !== offered.id, "a dismissed suggestion isn't offered again");
  const off: Trip = { ...emptyTrip(), permissions: emptyTrip().permissions.map((p) => (p.id === "suggest_extras" ? { ...p, enabled: false } : p)) };
  assert(say(off, LAKE_WEEKEND).trip.suggestions.length === 0, "with suggestions off, none is made");
});

run("Changing your mind mid-trip", () => {
  const trip = start(LAKE_WEEKEND);
  const hike = trip.intent.requirements.find((r) => r.label === "Guided hike")!;
  const without = removeTripRequirement(trip, hike.id, now).trip;
  assert(held(without).length === 3 && without.plan.length === 3, "removing the hike releases it and drops its step");

  const moved = say(trip, { checkIn: "Apr 23", checkOut: "Apr 25" });
  assert(moved.checkpoints[0].trip.changedChips.includes("dates"), "the changed chip is marked until it has been re-checked");
  assert(moved.trip.changedChips.length === 0, "and cleared once it has");
  assert(held(moved.trip).every((b) => b.day >= "2027-04-23"), "new dates re-plan every booking onto them");

  const richer = say(trip, { budgetTotalUsd: 900 });
  assert(site(richer.trip)?.id === "pine-hollow-14" && /still fits/.test(richer.factsToPhrase[0]), "a looser budget keeps the held site and says so");

  const released = releaseBooking(trip, "b-campsite", now).trip;
  assert(held(released).length === 0, "releasing the campsite releases what depended on it");
  const cleared = clearTripFact(trip, "dates", now).trip;
  assert(held(cleared).length === 0 && cleared.pendingAsk?.kind === "dates", "clearing the dates releases the holds and asks again");

  const must = setRequirementTier(trip, trip.intent.requirements.find((r) => r.label === "On the water")!.id, "must", now).trip;
  assert(must.intent.requirements.find((r) => r.label === "On the water")?.tier === "must", "a nice-to-have can be made a must-have");
});

run("Out of scope, and questions about the site, change nothing", () => {
  const trip = start(LAKE_WEEKEND);
  const flights = say(trip, { status: "unsupported", unsupportedReason: "I can't book flights or hotels." });
  assert(flights.trip === trip, "an unsupported request leaves the trip untouched");
  const stormy = fireForecastChange(trip, now).trip;
  assert(/still needs you/.test(say(stormy, { status: "unsupported", unsupportedReason: "No flights." }).factsToPhrase[0]), "and points back to an open decision");
  const asked = say(trip, { candidateQuestion: { topic: "water", amenityHint: null } });
  assert(asked.trip === trip && /lake/.test(asked.factsToPhrase[0]), "a question about the site is answered from its record");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll v3 trip checks passed.");
}
