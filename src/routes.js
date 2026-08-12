'use strict';

const express = require('express');
const {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  validateCreate,
  validateUpdate,
} = require('./todos');

const router = express.Router();

// Wrap async handlers so rejected promises reach the error middleware.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

router.get(
  '/todos',
  asyncHandler(async (req, res) => {
    const todos = await listTodos();
    res.status(200).json(todos);
  })
);

router.post(
  '/todos',
  asyncHandler(async (req, res) => {
    const { error, data } = validateCreate(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    const todo = await createTodo(data);
    res.status(201).json(todo);
  })
);

router.get(
  '/todos/:id',
  asyncHandler(async (req, res) => {
    const todo = await getTodo(req.params.id);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.status(200).json(todo);
  })
);

router.patch(
  '/todos/:id',
  asyncHandler(async (req, res) => {
    const { error, data } = validateUpdate(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    const todo = await updateTodo(req.params.id, data);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.status(200).json(todo);
  })
);

router.delete(
  '/todos/:id',
  asyncHandler(async (req, res) => {
    const deleted = await deleteTodo(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.status(204).send();
  })
);

module.exports = router;
