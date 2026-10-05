export const categories = [
  { id: 'food', name: 'Продукты', color: '#6b8a70', icon: '🥑' },
  { id: 'cafe', name: 'Кафе и рестораны', color: '#c79563', icon: '☕' },
  { id: 'transport', name: 'Транспорт', color: '#7297b6', icon: '🚕' },
  { id: 'home', name: 'Дом и счета', color: '#aa91b7', icon: '🏠' },
  { id: 'shopping', name: 'Покупки', color: '#cc8492', icon: '🛍️' },
  { id: 'health', name: 'Здоровье', color: '#71aaa2', icon: '💊' },
  { id: 'fun', name: 'Развлечения', color: '#d3af63', icon: '🎟️' },
  { id: 'other', name: 'Другое', color: '#99a0ac', icon: '✦' },
] as const

export type CategoryId = typeof categories[number]['id']
export type Expense = { id: string; amount: number; category: CategoryId; date: string; note: string }
// Amounts are stored as integer kopecks to avoid floating-point rounding errors.
export const STORAGE_KEY = 'expense-journal.v1'
export const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: kopecks % 100 ? 2 : 0 }).format(kopecks / 100)
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false
  const parsed = new Date(`${value}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value
}
export function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return amount > 0 && amount <= 9999999999 ? amount : null
}
export function validateExpenses(input: unknown): Expense[] {
  if (!Array.isArray(input) || input.length > 100000) throw new Error('Ожидается массив расходов, не более 100 000 записей.')
  const ids = new Set<string>()
  return input.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || !Number.isSafeInteger(item.amount) || item.amount <= 0 || item.amount > 9999999999
      || !categories.some(c => c.id === item.category) || typeof item.date !== 'string' || !validDate(item.date)
      || typeof item.note !== 'string' || item.note.length > 200) throw new Error('Файл содержит некорректные или повторяющиеся записи.')
    ids.add(item.id)
    return { id: item.id, amount: item.amount, category: item.category, date: item.date, note: item.note }
  })
}
export function loadExpenses(): Expense[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? [] : validateExpenses(JSON.parse(raw))
}
export function saveExpenses(expenses: Expense[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
}
export function summarize(expenses: Expense[]) {
  return {
    total: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    byCategory: categories.map(category => ({ ...category, total: expenses.filter(e => e.category === category.id).reduce((sum, e) => sum + e.amount, 0) })).sort((a, b) => b.total - a.total),
    byDay: Object.entries(expenses.reduce<Record<string, number>>((days, e) => { days[e.date] = (days[e.date] ?? 0) + e.amount; return days }, {})).sort(([a], [b]) => b.localeCompare(a)),
  }
}
