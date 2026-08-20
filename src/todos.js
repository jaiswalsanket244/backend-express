'use strict';

const { randomUUID } = require('crypto');
const { readTodos, mutate } = require('./store');

const VALID_STATUSES = ['todo', 'in-progress', 'done'];

// Sort by status (in the canonical column order) then by order ascending.
function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    const statusDiff =
      VALID_STATUSES.indexOf(a.status) - VALID_STATUSES.indexOf(b.status);
    if (statusDiff !== 0) return statusDiff;
    return a.order - b.order;
  });
}

async function listTodos() {
  const todos = await readTodos();
  return sortTodos(todos);
}

async function getTodo(id) {
  const todos = await readTodos();
  return todos.find((t) => t.id === id) || null;
}

/**
 * Validate a create payload.
 * Returns { error } string on failure, or { data } normalized fields.
 */
function validateCreate(body) {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' };
  }
  const { title, description, status } = body;

  if (typeof title !== 'string' || title.trim() === '') {
    return { error: 'title is required and must be a non-empty string' };
  }
  if (description !== undefined && typeof description !== 'string') {
    return { error: 'description must be a string' };
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return {
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    };
  }

  return {
    data: {
      title: title.trim(),
      description: typeof description === 'string' ? description : '',
      status: status || 'todo',
    },
  };
}

/**
 * Validate a partial update payload.
 * Returns { error } string on failure, or { data } with only provided fields.
 */
function validateUpdate(body) {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' };
  }
  const data = {};
  const { title, description, status, order } = body;

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return { error: 'title must be a non-empty string' };
    }
    data.title = title.trim();
  }
  if (description !== undefined) {
    if (typeof description !== 'string') {
      return { error: 'description must be a string' };
    }
    data.description = description;
  }
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return { error: `status must be one of: ${VALID_STATUSES.join(', ')}` };
    }
    data.status = status;
  }
  if (order !== undefined) {
    if (typeof order !== 'number' || !Number.isFinite(order)) {
      return { error: 'order must be a finite number' };
    }
    data.order = order;
  }

  return { data };
}

async function createTodo(fields) {
  return mutate((todos) => {
    // New todo goes to the end of its status column.
    const sameStatus = todos.filter((t) => t.status === fields.status);
    const maxOrder = sameStatus.reduce(
      (max, t) => (t.order > max ? t.order : max),
      -1
    );
    const now = new Date().toISOString();
    const todo = {
      id: randomUUID(),
      title: fields.title,
      description: fields.description,
      status: fields.status,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    };
    return { todos: [...todos, todo], result: todo };
  });
}

async function updateTodo(id, fields) {
  return mutate((todos) => {
    const idx = todos.findIndex((t) => t.id === id);
    if (idx === -1) {
      return { todos, result: null };
    }
    const updated = {
      ...todos[idx],
      ...fields,
      id: todos[idx].id,
      createdAt: todos[idx].createdAt,
      updatedAt: new Date().toISOString(),
    };
    const next = [...todos];
    next[idx] = updated;
    return { todos: next, result: updated };
  });
}

async function deleteTodo(id) {
  return mutate((todos) => {
    const exists = todos.some((t) => t.id === id);
    if (!exists) {
      return { todos, result: false };
    }
    return { todos: todos.filter((t) => t.id !== id), result: true };
  });
}

module.exports = {
  VALID_STATUSES,
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  validateCreate,
  validateUpdate,
};
