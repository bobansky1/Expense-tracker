import type { Category, Expense } from './expenses'
export type User = { id: string; email: string }
export type Session = { user: User | null; csrf: string; setupRequired: boolean }
export type Snapshot = { expenses: Expense[]; categories: Category[]; revision: number }
export type Mutation = { type: 'upsert'; expense: Expense } | { type: 'delete'; id: string } | { type: 'category'; category: Category } | { type: 'replace' | 'merge'; expenses: Expense[]; categories?: Category[] }
let csrf = ''
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
async function request<T>(action: string, body?: object): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/index.php?action=' + action, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
    })
  } catch { throw new ApiError('Нет ответа от сервера. Изменения могли сохраниться: обновите список перед повторной попыткой.', 0) }
  let data: T & { error?: string; csrf?: string }
  try { data = await response.json() } catch { throw new ApiError('Сервер вернул неожиданный ответ. Проверьте настройку PHP и обновите список.', 0) }
  if (!response.ok) throw new ApiError(data.error || 'Не удалось выполнить запрос.', response.status)
  if (data.csrf) csrf = data.csrf
  return data
}
export const api = {
  session: () => request<Session>('session'),
  login: (email: string, password: string, token?: string) => request<Session>(token === undefined ? 'login' : 'setup', { email, password, token }),
  logout: () => request<Session>('logout', { logout: true }),
  expenses: () => request<Snapshot>('expenses'),
  mutate: (revision: number, mutation: Mutation) => request<Snapshot>('mutate', { revision, ...mutation }),
}
