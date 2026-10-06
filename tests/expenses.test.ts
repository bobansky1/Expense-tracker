import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categories, validateCategories, parseAmount, summarize, validateExpenses, validDate } from '../src/lib/expenses.ts'

test('decimal input is converted to integer kopecks without precision loss', () => {
  assert.equal(parseAmount('0,29'), 29)
  assert.equal(parseAmount('1250.5'), 125050)
  assert.equal(parseAmount('99999999,99'), 9999999999)
  for (const invalid of ['0', '-5', '1.001', '1e3', 'Infinity', '', '100000000']) assert.equal(parseAmount(invalid), null)
})
test('real calendar dates including leap years are validated', () => {
  assert.equal(validDate('2024-02-29'), true)
  assert.equal(validDate('2025-02-29'), false)
  assert.equal(validDate('2026-04-31'), false)
  assert.equal(validDate('2026-13-01'), false)
})
const records = [
  { id: 'a', amount: 29, category: 'food', date: '2026-09-30', note: '' },
  { id: 'b', amount: 101, category: 'food', date: '2026-10-01', note: 'Хлеб' },
  { id: 'c', amount: 25000, category: 'cafe', date: '2026-10-01', note: 'Кофе' },
]
test('totals match across categories and days, months remain separate', () => {
  const expenses = validateExpenses(records)
  const result = summarize(expenses)
  assert.equal(result.total, 25130)
  assert.equal(result.byCategory.find(c => c.id === 'food')?.total, 130)
  assert.deepEqual(result.byDay, [['2026-10-01', 25101], ['2026-09-30', 29]])
  assert.equal(summarize(expenses.filter(e => e.date.startsWith('2026-10'))).total, 25101)
  assert.equal(summarize([]).total, 0)
})
test('restore rejects corrupt, duplicate or unsupported records', () => {
  assert.throws(() => validateExpenses([...records, records[0]]))
  for (const invalid of [{ ...records[0], amount: 0.5 }, { ...records[0], category: 'fake' }, { ...records[0], date: '2026-02-30' }, { ...records[0], note: 'a'.repeat(201) }]) assert.throws(() => validateExpenses([invalid]))
  assert.throws(() => validateExpenses({ expenses: records }))
  assert.deepEqual(validateExpenses(JSON.parse(JSON.stringify(records))), records)
})


test('custom categories survive backups and contribute to summaries', () => {
  const custom = validateCategories([{ id: 'custom-study', name: ' Образование ', icon: '📚', color: '#7297b6' }])
  assert.equal(custom[0].name, 'Образование')
  const expense = { ...records[0], category: 'custom-study' }
  assert.throws(() => validateExpenses([expense]))
  const backup = JSON.parse(JSON.stringify({ categories: custom, expenses: [expense] }))
  const available = [...categories, ...validateCategories(backup.categories)]
  const restored = validateExpenses(backup.expenses, available)
  assert.equal(summarize(restored, available).byCategory.find(c => c.id === expense.category)?.total, 29)
  assert.equal(summarize(restored, available).byCategory.reduce((sum, c) => sum + c.total, 0), 29)
  for (const patch of [{ name: 'продукты' }, { name: ' ' }, { color: 'red' }, { id: 'food' }, { icon: '' }]) assert.throws(() => validateCategories([{ ...custom[0], ...patch }]))
  assert.throws(() => validateCategories([...custom, { ...custom[0], id: 'custom-another' }]))
})
