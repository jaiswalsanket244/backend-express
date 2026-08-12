'use strict';

const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

// Serialize all mutations through a single promise chain so that concurrent
// read-modify-write cycles never interleave and clobber each other. This keeps
// the JSON file consistent for a single-user local app.
let writeLock = Promise.resolve();

async function ensureFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf8');
  }
}

async function readTodos() {
  await ensureFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt/unexpected contents: fail safe with an empty list rather than
    // crashing the server on every request.
    return [];
  }
}

async function writeTodos(todos) {
  await ensureFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(todos, null, 2), 'utf8');
}

/**
 * Run a read-modify-write mutation with exclusive access to the data file.
 * `mutator` receives the current todos array and returns
 * `{ todos, result }` where `todos` is the new array to persist and `result`
 * is whatever value the caller wants back.
 */
function mutate(mutator) {
  const run = writeLock.then(async () => {
    const todos = await readTodos();
    const { todos: next, result } = await mutator(todos);
    await writeTodos(next);
    return result;
  });
  // Keep the lock chain alive regardless of individual success/failure.
  writeLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

module.exports = {
  DATA_FILE,
  ensureFile,
  readTodos,
  writeTodos,
  mutate,
};
