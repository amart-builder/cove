import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readComponent = (name) => readFileSync(new URL(`../src/components/tasks/${name}.tsx`, import.meta.url), 'utf8');

test('Today and Morning Arrival have no separate recommendation approval controls', () => {
  assert.doesNotMatch(readComponent('TodayView'), /<QuietCurrentInbox|<PlanningFollowUp/);
  assert.doesNotMatch(readComponent('MorningArrival'), /<PlanningFollowUp/);
  assert.match(readComponent('MorningArrival'), /step === 'plan' && plan.state !== 'active' && <PlanningQuestion/);
});

test('the four-dot button and the done counter open Plan your day instead of a separate grid', () => {
  const stage = readComponent('TodayRiverStageV2');
  const gridButton = stage.slice(stage.indexOf('className="today2-grid-button"') - 60);
  assert.match(gridButton.slice(0, 700), /disabled={model.morningArrivalDisabled}/);
  assert.match(gridButton.slice(0, 700), /onClick={openDayPlan}/);
  assert.match(stage, /function openDayPlan\(\) {\s*if \(model.morningArrivalDisabled\) return;[\s\S]{0,120}callbacks.onOpenDayPlan\(\);/);
  const marker = stage.slice(stage.indexOf('className="today2-done-marker"'));
  assert.match(marker.slice(0, 600), /else callbacks.onOpenDayPlan\(\)/);
  // The separate Focus Grid modal is gone; Plan your day is the one place to reorganize.
  assert.doesNotMatch(stage, /Focus Grid|<DayRitualLayer|today2-grid-panel|onGridOpenChange/);
  assert.doesNotMatch(readComponent('TodayView'), /onGridOpenChange|today2GridOpen/);
  assert.match(readComponent('TodayView'), /onOpenDayPlan: \(\) => void openMorningArrival\('plan'\)/);
});

test('the done counter keeps its inline list when Plan your day cannot open', () => {
  const stage = readComponent('TodayRiverStageV2');
  assert.match(stage, /if \(model.morningArrivalDisabled\) setWakeOpen\(\(current\) => !current\);/);
  assert.match(stage, /{wakeOpen && model.morningArrivalDisabled && \(/);
});

test('Plan your day lists what is already done, fed from the done-today list', () => {
  const today = readComponent('TodayView');
  assert.match(today, /completedTasks={arrivalCompletedTasks}/);
  assert.match(today, /const arrivalCompletedTasks = useMemo<MorningArrivalCompletedTask\[\]>\(\s*\(\) => doneToday.map/);
  assert.match(today, /onReopen={reopenArrivalTask}/);
  assert.match(readComponent('MorningArrival'), /completedTasks={completedTasks}/);
});

test('full-plan entry starts at the plan while normal and new-day arrivals start at the brief', () => {
  const today = readComponent('TodayView');
  assert.match(today, /onOpenDayPlan: \(\) => void openMorningArrival\('plan'\)/);
  assert.match(today, /step: 'brief' \| 'plan' = 'brief'/);
  assert.match(today, /initialStep={arrivalEntry\?\.planId === dayRitual.plan.id \? arrivalEntry.step : 'brief'}/);
  const arrival = readComponent('MorningArrival');
  assert.match(arrival, /initialStep = 'brief'/);
  assert.match(arrival, /useState<ArrivalStep>\(initialStep\)/);
});

test('after the day starts, Plan your day leads back to Today instead of starting the day again', () => {
  const arrival = readComponent('MorningArrival');
  assert.match(arrival, /const dayStarted = plan.state === 'active';/);
  assert.match(arrival, /const backToToday = dayStarted && isFinalStep;/);
  assert.match(arrival, /if \(backToToday\) void onBypass\(\);/);
  assert.match(arrival, /backToToday \? 'Back to Today'/);
  assert.match(arrival, /{!dayStarted && \(\s*<button[^>]*onClick={\(\) => void onSnooze\(\)}/);
});
