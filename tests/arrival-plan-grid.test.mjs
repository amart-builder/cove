import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  addNotTodayDropToToday,
  ALREADY_COMPLETED_ZONE_ID,
  ALSO_TODAY_ZONE_ID,
  INITIAL_PRIORITY_ZONE_ID,
  NOT_TODAY_ZONE_ID,
  persistArrivalPriorityDrag,
  placeArrivingItem,
  TODAY_ZONE_ID,
} from '../src/components/tasks/arrival/ArrivalPlanGrid.tsx';

test('a Not today drag ending over the Today drop zone calls the add handler', () => {
  const calls = [];
  const handled = addNotTodayDropToToday(
    'not-today:task-a',
    TODAY_ZONE_ID,
    [{ id: 'task-a', title: 'Task A' }],
    (task) => {
      calls.push(task.id);
      return true;
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ['task-a']);
});

test('all three persistent buckets register inside DndContext', () => {
  const source = readFileSync(
    new URL('../src/components/tasks/arrival/ArrivalPlanGrid.tsx', import.meta.url),
    'utf8',
  );
  const childStart = source.indexOf('function ArrivalDropBucket');
  const gridStart = source.indexOf('export default function ArrivalPlanGrid');
  const contextRender = source.indexOf('<DndContext', gridStart);
  const firstBucketRender = source.indexOf('<ArrivalDropBucket', contextRender);

  assert.ok(childStart >= 0);
  assert.ok(source.indexOf('useDroppable({ id })', childStart) < gridStart);
  assert.ok(contextRender >= 0 && firstBucketRender > contextRender);
  assert.match(source, /id={INITIAL_PRIORITY_ZONE_ID}/);
  assert.match(source, /id={ALSO_TODAY_ZONE_ID}/);
  assert.match(source, /id={NOT_TODAY_ZONE_ID}/);
  assert.match(source, /alsoTodayViews\.length === 0/);
  assert.doesNotMatch(source, /<SortableContext/);
  assert.doesNotMatch(source, /useSortable\(/);
});

test('dragging announces human bucket names and rolls back a failed new-task promotion', () => {
  const source = readFileSync(
    new URL('../src/components/tasks/arrival/ArrivalPlanGrid.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /accessibility={dragAccessibility}/);
  assert.match(source, /Move to Initial priorities, Also today, Not today, or Already completed/);
  assert.match(source, /Use the arrow keys to choose a section/);
  assert.match(source, /await onRemove\(addedItem\.id, task\.title, true\)/);
});

test('the legacy Today zone resolves to Also Today and all bucket ids stay distinct', () => {
  assert.equal(TODAY_ZONE_ID, ALSO_TODAY_ZONE_ID);
  assert.notEqual(INITIAL_PRIORITY_ZONE_ID, ALSO_TODAY_ZONE_ID);
  assert.notEqual(NOT_TODAY_ZONE_ID, ALSO_TODAY_ZONE_ID);
});

test('Morning Arrival labels the focus band and uses completion checks instead of Not today arrows', () => {
  const source = readFileSync(
    new URL('../src/components/tasks/arrival/ArrivalPlanGrid.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, />\s*Initial priorities\s*</);
  assert.match(source, /aria-label={`Mark \${title} complete`}/);
  assert.match(source, /onComplete\(view\.item\.id, view\.title\)/);
  assert.match(source, /onCompleteBoardTask\(task\.id, task\.title\)/);
  assert.doesNotMatch(source, /aria-label={`Add \${task\.title} to today`}/);
});

test('a dynamic priority drag saves the move before its new focus count', async () => {
  const calls = [];
  await persistArrivalPriorityDrag({
    itemId: 'item-b',
    title: 'Task B',
    originalPosition: 2,
    nextPosition: 0,
    focusCount: 1,
    nextFocusCount: 2,
    onMoveToPosition: async (_itemId, position) => calls.push(`move:${position}`),
    onFocusCountChange: async (count) => calls.push(`focus:${count}`),
  });

  assert.deepEqual(calls, ['move:0', 'focus:2']);
});

test('a failed focus-count save rolls the card back to its original position', async () => {
  const calls = [];
  await assert.rejects(
    persistArrivalPriorityDrag({
      itemId: 'item-b',
      title: 'Task B',
      originalPosition: 2,
      nextPosition: 0,
      focusCount: 1,
      nextFocusCount: 2,
      onMoveToPosition: async (_itemId, position) => calls.push(`move:${position}`),
      onFocusCountChange: async () => {
        calls.push('focus:failed');
        throw new Error('settings unavailable');
      },
    }),
    /settings unavailable/,
  );

  assert.deepEqual(calls, ['move:0', 'focus:failed', 'move:2']);
});

const planWith = (items) => ({
  plan: {
    items: items.map(([id, taskId, decision], position) => ({ id, taskId, decision, position })),
  },
});

test('Already completed is the last section, below Not today, and is its own drop zone', () => {
  const source = readFileSync(
    new URL('../src/components/tasks/arrival/ArrivalPlanGrid.tsx', import.meta.url),
    'utf8',
  );
  const notToday = source.indexOf('id="arrival-not-today-title"');
  const completed = source.indexOf('id="arrival-already-completed-title"');
  assert.ok(notToday > 0 && completed > notToday);
  assert.match(source, /id={ALREADY_COMPLETED_ZONE_ID}/);
  assert.match(source, /useDraggable\({ id: `completed:\${task\.id}`/);
  assert.match(source, /aria-label={`Reopen \${title}`}/);
  assert.match(source, /detail: { kind: 'completed', task }/);
  assert.notEqual(ALREADY_COMPLETED_ZONE_ID, NOT_TODAY_ZONE_ID);
});

test('dropping a Today card on Already completed completes it; a Not today card completes as a board task', () => {
  const source = readFileSync(
    new URL('../src/components/tasks/arrival/ArrivalPlanGrid.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /if \(overId === ALREADY_COMPLETED_ZONE_ID\) {\s*await onComplete\(activeItemId, activeView\.title\);/);
  assert.match(source, /if \(outcome\.zone === 'completed'\) {\s*await onCompleteBoardTask\(task\.id, task\.title\);/);
  assert.match(source, /await onReopen\(task\.id, task\.title, outcome\.zone\)/);
});

test('a task reopened into Initial priorities takes the next seat and widens the focus band', async () => {
  const calls = [];
  // Reopening restored C at its old spot, index 0, ahead of A and B.
  const itemId = await placeArrivingItem({
    result: planWith([['item-c', 'task-c', 'accepted'], ['item-a', 'task-a', 'accepted'], ['item-b', 'task-b', 'accepted'], ['item-x', 'task-x', 'completed']]),
    taskId: 'task-c',
    title: 'C',
    zone: 'priority',
    focusCount: 1,
    onMoveToPosition: async (id, position) => calls.push(`move:${id}:${position}`),
    onFocusCountChange: async (count) => calls.push(`focus:${count}`),
  });
  assert.equal(itemId, 'item-c');
  assert.deepEqual(calls, ['move:item-c:1', 'focus:2']);
});

test('a task reopened into Also today goes to the end and leaves the focus band alone', async () => {
  const calls = [];
  await placeArrivingItem({
    result: planWith([['item-a', 'task-a', 'accepted'], ['item-c', 'task-c', 'accepted'], ['item-b', 'task-b', 'accepted']]),
    taskId: 'task-c',
    title: 'C',
    zone: 'also-today',
    focusCount: 2,
    onMoveToPosition: async (id, position) => calls.push(`move:${id}:${position}`),
    onFocusCountChange: async (count) => calls.push(`focus:${count}`),
  });
  assert.deepEqual(calls, ['move:item-c:2']);
});

test('a task that already sits at the end of Also today is not moved again', async () => {
  const calls = [];
  await placeArrivingItem({
    result: planWith([['item-a', 'task-a', 'accepted'], ['item-c', 'task-c', 'accepted']]),
    taskId: 'task-c',
    title: 'C',
    zone: 'also-today',
    focusCount: 1,
    onMoveToPosition: async () => calls.push('move'),
    onFocusCountChange: async () => calls.push('focus'),
  });
  assert.deepEqual(calls, []);
});

test('a task reopened into Also today stays out of empty focus seats', async () => {
  // Focus is saved at three but only two other tasks are open, so the third
  // seat is empty and the reopened task would land in it. Also today means
  // below the band, so the band narrows to the seats that are filled.
  const calls = [];
  await placeArrivingItem({
    result: planWith([['item-a', 'task-a', 'accepted'], ['item-b', 'task-b', 'accepted'], ['item-c', 'task-c', 'accepted']]),
    taskId: 'task-c',
    title: 'C',
    zone: 'also-today',
    focusCount: 3,
    onMoveToPosition: async (id, position) => calls.push(`move:${id}:${position}`),
    onFocusCountChange: async (count) => calls.push(`focus:${count}`),
  });
  assert.deepEqual(calls, ['focus:2']);
});

test('a task reopened into Initial priorities fills an empty seat without growing the band', async () => {
  const calls = [];
  await placeArrivingItem({
    result: planWith([['item-c', 'task-c', 'accepted'], ['item-a', 'task-a', 'accepted'], ['item-b', 'task-b', 'accepted']]),
    taskId: 'task-c',
    title: 'C',
    zone: 'priority',
    focusCount: 3,
    onMoveToPosition: async (id, position) => calls.push(`move:${id}:${position}`),
    onFocusCountChange: async (count) => calls.push(`focus:${count}`),
  });
  assert.deepEqual(calls, ['move:item-c:2']);
});
