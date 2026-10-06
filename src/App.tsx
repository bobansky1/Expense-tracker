import { useRef, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, LayoutDashboard, ListFilter, Pencil, Plus, Search, ShieldCheck, Trash2, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { categories as defaultCategories, validateCategories, loadExpenses, localDate, money, parseAmount, summarize, validDate, validateExpenses } from '@/lib/expenses'
import { api, ApiError } from '@/lib/api'
import type { Snapshot, User, Mutation } from '@/lib/api'
import type { Category, CategoryId, Expense } from '@/lib/expenses'
import './App.css'

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App({ initial, user, onLogout }: { initial: Snapshot; user: User; onLogout: () => void }) {
  const [expenses, setExpenses] = useState<Expense[]>(initial.expenses)
  const [customCategories, setCustomCategories] = useState<Category[]>(initial.categories ?? [])
  const categories = [...defaultCategories, ...customCategories]
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState('#6b8a70')
  const [categoryIcon, setCategoryIcon] = useState('✦')
  const [categoryError, setCategoryError] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const dayExpenses = expenses.filter(e => e.date === selectedDay)
  const [importCategories, setImportCategories] = useState<Category[]>([])
  const [revision, setRevision] = useState(initial.revision)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [syncRequired, setSyncRequired] = useState(false)
  const [message, setMessage] = useState('')
  const [localCopy] = useState(() => { try { return { expenses: loadExpenses(), error: '' } } catch { return { expenses: [] as Expense[], error: 'Не удалось прочитать старые записи. Исходная копия в браузере сохранена.' } } })
  const [localDismissed, setLocalDismissed] = useState(false)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace')
  const [month, setMonth] = useState(localDate().slice(0, 7))
  const [section, setSection] = useState('overview')
  const [group, setGroup] = useState('entries')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftId, setDraftId] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<CategoryId>('food')
  const [date, setDate] = useState(localDate())
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null)
  const [pendingImport, setPendingImport] = useState<Expense[] | null>(null)
  const [help, setHelp] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const monthExpenses = expenses.filter(e => e.date.startsWith(month))
  const summary = summarize(monthExpenses, categories)
  const allTotal = summarize(expenses).total
  const todayTotal = summarize(expenses.filter(e => e.date === localDate())).total
  const visible = monthExpenses.filter(e => (filter === 'all' || e.category === filter) && `${e.note} ${categories.find(c => c.id === e.category)?.name} ${e.date}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const filteredSummary = summarize(visible, categories)
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')
  const activeDays = summary.byDay.length
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, total: summary.byDay.find(([d]) => Number(d.slice(-2)) === i + 1)?.[1] ?? 0 }))
  const peak = Math.max(...daily.map(d => d.total), 1)

  async function commit(mutation: Mutation) {
    if (busyRef.current || syncRequired) return false
    busyRef.current = true; setBusy(true)
    try {
      const next = await api.mutate(revision, mutation)
      setExpenses(next.expenses); setCustomCategories(next.categories ?? []); setRevision(next.revision); return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить изменения.')
      if (!(error instanceof ApiError) || [0, 401, 403, 409, 503].includes(error.status)) setSyncRequired(true)
      return false
    } finally { busyRef.current = false; setBusy(false) }
  }
  async function refresh() {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try {
      const next = await api.expenses(); setExpenses(next.expenses); setCustomCategories(next.categories ?? []); setRevision(next.revision)
      setSyncRequired(false); setMessage('Список обновлён. Если вы редактировали запись, проверьте её перед сохранением.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось обновить список.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function logout() {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true)
    try { await api.session(); await api.logout(); onLogout() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось выйти.') }
    finally { busyRef.current = false; setBusy(false) }
  }
  function startAdd(day = localDate()) { setEditing(null); setDraftId(crypto.randomUUID()); setAmount(''); setCategory('food'); setDate(day); setNote(''); setFormError(''); setOpen(true) }
  function startEdit(e: Expense) { setEditing(e.id); setAmount(String(e.amount / 100)); setCategory(e.category); setDate(e.date); setNote(e.note); setFormError(''); setOpen(true) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseAmount(amount)
    if (parsed === null) { setFormError('Введите сумму от 0,01 до 99 999 999,99 ₽, не более двух знаков после запятой.'); return }
    if (!validDate(date)) { setFormError('Выберите корректную дату от 1900 до 2100 года.'); return }
    const expense: Expense = { id: editing ?? draftId, amount: parsed, category, date, note: note.trim() }
    if (await commit({ type: 'upsert', expense })) {
      setMonth(date.slice(0, 7)); setOpen(false); setMessage(editing ? 'Расход изменён.' : 'Расход добавлен и сохранён.'); setFilter('all'); setQuery('')
    } else { setFormError('Сохранение не подтверждено. Закройте окно и обновите список. Введённые данные останутся в форме.') }
  }
  function moveMonth(delta: number) {
    const next = new Date(`${month}-01T12:00:00`); next.setMonth(next.getMonth() + delta)
    const value = localDate(next).slice(0, 7)
    if (value >= '1900-01' && value <= '2100-12') setMonth(value)
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Файл слишком большой: максимум 25 МБ.')
      const parsed = JSON.parse(await file.text())
      setImportMode('replace')
      const imported = validateCategories(Array.isArray(parsed) ? [] : parsed.categories ?? [])
      setImportCategories(imported)
      setPendingImport(validateExpenses(Array.isArray(parsed) ? parsed : parsed.expenses, [...defaultCategories, ...imported]))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось прочитать файл.') }
  }
  function exportJson() {
    download(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), expenses, categories: customCategories }, null, 2), `expenses-${localDate()}.json`, 'application/json')
    setMessage('Резервная копия всех расходов скачана.')
  }
  function exportCsv() {
    const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? "'" : '') + v.replaceAll('"', '""')}"`
    const rows = visible.map(e => [e.date, (e.amount / 100).toFixed(2).replace('.', ','), categories.find(c => c.id === e.category)!.name, e.note].map(cell).join(';'))
    download('\uFEFFДата;Сумма (RUB);Категория;Заметка\r\n' + rows.join('\r\n'), `expenses-${month}.csv`, 'text/csv;charset=utf-8')
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Траты — главная" onClick={e => { e.preventDefault(); setSection('overview') }}><span className="brand-icon"><Wallet size={21}/></span>траты<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="avatar">Я</span><div><strong>Мои финансы</strong><small>Личное пространство</small></div></div>
      <div className="nav-label">ПРОСТРАНСТВО</div>
      <nav aria-label="Основная навигация">
        <Button variant="ghost" className={section === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('overview')}><LayoutDashboard size={18}/>Обзор</Button>
        <Button variant="ghost" className={section === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('history')}><CalendarDays size={18}/>История расходов<Badge variant="secondary">{expenses.length}</Badge></Button>
      </nav>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={20}/><strong>Ваши данные — у вас</strong><p>Расходы сохраняются в вашем аккаунте. Скачивайте резервные копии.</p><Button variant="ghost" onClick={exportJson}>Скачать копию <ArrowUpRight size={14}/></Button></div><Button variant="ghost" className="help-button" onClick={() => setHelp(true)}><CircleHelp size={17}/>Как это работает</Button><div className="profile"><span className="avatar small">Я</span><div><strong>Личный учёт</strong><small>{user.email}</small></div></div></div>
    </aside>
    <main>
      <header className="topbar"><span>Мои финансы <span className="breadcrumb">/</span> <strong>{section === 'overview' ? 'Обзор' : 'История расходов'}</strong></span><div className="account-actions"><span className="storage-status"><span/>{busy ? 'Сохраняем…' : syncRequired ? 'Нужно обновить' : 'В аккаунте'}</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => void refresh()}>Обновить</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void logout()}>Выйти</Button></div></header>
      <div className="content" key={section}>
        <div className="page-heading"><div><div className="eyebrow">ДЕНЬГИ ПОД КОНТРОЛЕМ</div><h1>{section === 'overview' ? 'Всё начинается с ясности' : 'История ваших расходов'}</h1><p>{section === 'overview' ? 'Записывайте траты. Замечайте привычки. Планируйте спокойнее.' : 'Каждая покупка на своём месте — по дням, месяцам и категориям.'}</p></div><Button className="add-button" disabled={busy || syncRequired} onClick={() => startAdd()}><Plus size={18}/>Добавить расход</Button></div>
        {message && <div className="notice" role="status"><span>{message}</span><Button size="icon" variant="ghost" aria-label="Закрыть уведомление" onClick={() => setMessage('')}><X size={16}/></Button></div>}
        {syncRequired && <div className="notice" role="alert">Сначала обновите список. Если сеанс завершён — выйдите и войдите снова.<Button disabled={busy} onClick={() => void refresh()}>Обновить</Button></div>}
        {!localDismissed && (localCopy.expenses.length > 0 || localCopy.error) && <div className="notice local-migration"><span>{localCopy.error || ('В этом браузере осталось ' + localCopy.expenses.length + ' старых записей. Их можно добавить в аккаунт. Исходная копия останется.')}</span><div><Button variant="outline" onClick={() => { try { download(localStorage.getItem('expense-journal.v1') ?? '[]', 'expenses-browser-backup.json', 'application/json') } catch { setMessage('Не удалось прочитать браузерное хранилище.') } }}>Скачать старую копию</Button>{!localCopy.error && <Button disabled={busy || syncRequired} onClick={() => { setImportMode('merge'); setImportCategories([]); setPendingImport(localCopy.expenses) }}>Перенести</Button>}<Button variant="ghost" onClick={() => setLocalDismissed(true)}>Скрыть</Button></div></div>}
        <div className="period-row"><div className="period-picker"><Button variant="ghost" size="icon" aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}><ChevronLeft size={17}/></Button><Label htmlFor="month-picker" className="month-title"><CalendarDays size={16}/>{monthLabel}</Label><Input id="month-picker" type="month" value={month} min="1900-01" max="2100-12" aria-label="Выбрать месяц" onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value >= '1900-01' && e.target.value <= '2100-12') setMonth(e.target.value) }}/><Button variant="ghost" size="icon" aria-label="Следующий месяц" onClick={() => moveMonth(1)}><ChevronRight size={17}/></Button></div><span className="period-caption">Ваш финансовый месяц в деталях</span></div>
        <div className="stats-grid">
          <Card className="stat-card main-stat"><CardContent><div className="stat-label">Расходы за месяц <Wallet size={17}/></div><div className="stat-value">{money(summary.total)}</div><div className="stat-foot">{monthExpenses.length} записей <span>·</span> {monthLabel}</div></CardContent></Card>
          <Card className="stat-card"><CardContent><div className="stat-label">Сегодня <CalendarDays size={17}/></div><div className="stat-value">{money(todayTotal)}</div><div className="stat-foot">{dateLabel(localDate())} <span>·</span> все категории</div></CardContent></Card>
          <Card className="stat-card"><CardContent><div className="stat-label">В среднем за день <ListFilter size={17}/></div><div className="stat-value">{money(activeDays ? Math.round(summary.total / activeDays) : 0)}</div><div className="stat-foot">По дням с расходами в этом месяце</div></CardContent></Card>
          <Card className="stat-card"><CardContent><div className="stat-label">За всё время <ArrowUpRight size={17}/></div><div className="stat-value">{money(allTotal)}</div><div className="stat-foot">{expenses.length} записей в вашей истории</div></CardContent></Card>
        </div>
        {section === 'overview' && <div className="charts-grid">
          <Card className="chart-card"><CardContent><div className="card-heading"><div><h2>Ритм расходов</h2><p>Нажмите на день, чтобы посмотреть покупки</p></div><Badge variant="outline">По дням</Badge></div><div className="chart" role="group" aria-label={`Расходы по дням за ${monthLabel}. Всего ${money(summary.total)}`}><div className="chart-grid"><span>{money(peak === 1 ? 100000 : peak)}</span><span>{money(peak === 1 ? 50000 : Math.round(peak / 2))}</span><span>0 ₽</span></div><div className="bars">{daily.map(d => <button type="button" key={d.day} className="bar-column" aria-label={d.day + ' ' + monthLabel + ': ' + money(d.total) + '. Открыть расходы'} onClick={() => setSelectedDay(month + '-' + String(d.day).padStart(2, '0'))}><div className={`bar ${d.total ? '' : 'empty-bar'}`} style={{ height: d.total ? `${Math.max(3, d.total / peak * 100)}%` : '3px' }} title={`${d.day} ${monthLabel}: ${money(d.total)}`}/><span>{[1, 5, 10, 15, 20, 25, daysInMonth].includes(d.day) ? d.day : ''}</span></button>)}</div>{!summary.total && <div className="chart-empty"><span>Здесь появится ваш ритм</span><small>Добавьте первый расход, чтобы увидеть график</small></div>}</div><div className="chart-footer"><span className="legend-dot"/>Расходы за день <span className="chart-foot-right">{monthLabel}</span></div></CardContent></Card>
          <Card className="categories-card"><CardContent><div className="card-heading"><div><h2>Куда уходят деньги</h2><p>Распределение по категориям</p></div><Button variant="ghost" size="icon" aria-label="Добавить свою категорию" disabled={busy || syncRequired} onClick={() => { setCategoryError(''); setCategoryOpen(true) }}><Plus size={17}/></Button></div><div className="category-list">{summary.byCategory.some(c => c.total > 0) ? summary.byCategory.filter(c => c.total > 0).map(c => <div className="category-row" key={c.id}><span className="category-icon" style={{ background: `${c.color}18` }}>{c.icon}</span><div className="category-detail"><div><span>{c.name}</span><strong>{money(c.total)}</strong></div><div className="progress-track"><div style={{ width: `${c.total / summary.total * 100}%`, background: c.color }}/></div></div><span className="category-percent">{Math.round(c.total / summary.total * 100)}%</span></div>) : <div className="category-empty"><div className="empty-ring"><Wallet size={27}/></div><strong>У каждой траты своя категория</strong><p>Добавьте расход — и увидите,<br/>на что тратите больше всего.</p></div>}</div></CardContent></Card>
        </div>}
        <Card className="transactions"><CardContent><div className="card-heading transactions-heading"><div><h2>Расходы <Badge variant="secondary">{visible.length}</Badge></h2><p>Всё важное о ваших покупках в одном месте</p></div><div className="export-actions"><Button variant="outline" size="sm" onClick={exportCsv} disabled={!visible.length}><ArrowDownToLine size={15}/>CSV</Button><Button variant="outline" size="sm" onClick={exportJson}><ArrowDownToLine size={15}/>Копия JSON</Button><Button variant="ghost" size="sm" disabled={busy || syncRequired} onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={15}/>Восстановить</Button><input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={importFile}/></div></div><div className="table-toolbar"><Tabs value={group} onValueChange={setGroup}><TabsList><TabsTrigger value="entries">Все записи</TabsTrigger><TabsTrigger value="days">По дням</TabsTrigger><TabsTrigger value="categories">По категориям</TabsTrigger><TabsTrigger value="months">По месяцам</TabsTrigger></TabsList></Tabs><div className="filters"><div className="search-input"><Search size={16}/><Input placeholder="Найти расход..." aria-label="Поиск расходов" value={query} onChange={e => setQuery(e.target.value)} disabled={group === 'months'}/></div><Select value={filter} onValueChange={setFilter} disabled={group === 'months'}><SelectTrigger aria-label="Фильтр категории"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Все категории</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}</SelectContent></Select></div></div>
          {group === 'months' ? <Table><TableHeader><TableRow><TableHead>Месяц · вся история</TableHead><TableHead>Записей</TableHead><TableHead className="text-right">Сумма</TableHead></TableRow></TableHeader><TableBody>{[...new Set(expenses.map(e => e.date.slice(0, 7)))].sort().reverse().map(m => <TableRow key={m}><TableCell><Button variant="link" onClick={() => { setMonth(m); setGroup('entries') }}>{new Date(`${m}-01T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</Button></TableCell><TableCell>{expenses.filter(e => e.date.startsWith(m)).length}</TableCell><TableCell className="text-right font-semibold">{money(summarize(expenses.filter(e => e.date.startsWith(m))).total)}</TableCell></TableRow>)}{!expenses.length && <TableRow><TableCell colSpan={3} className="text-center py-12">Пока нет расходов. Добавьте первую запись.</TableCell></TableRow>}</TableBody></Table> : !visible.length ? <div className="table-empty"><span className="empty-icon"><Wallet size={25}/></span><h3>{monthExpenses.length ? 'Ничего не найдено' : 'Новый месяц — чистый лист'}</h3><p>{monthExpenses.length ? 'Попробуйте изменить поиск или категорию.' : 'Кофе по пути, продукты домой или большой план.'}<br/>{!monthExpenses.length && 'Запишите первую трату — остальное мы посчитаем.'}</p><Button variant="outline" onClick={monthExpenses.length ? () => { setQuery(''); setFilter('all') } : () => startAdd()}>{monthExpenses.length ? 'Сбросить фильтры' : <><Plus size={16}/>Добавить первый расход</>}</Button></div> : <><Table><TableHeader><TableRow>{group === 'entries' ? <><TableHead>Расход</TableHead><TableHead>Категория</TableHead><TableHead>Дата</TableHead><TableHead className="text-right">Сумма</TableHead><TableHead><span className="sr-only">Действия</span></TableHead></> : <><TableHead>{group === 'days' ? 'День' : 'Категория'}</TableHead><TableHead>Записей</TableHead><TableHead className="text-right">Сумма</TableHead></>}</TableRow></TableHeader><TableBody>{group === 'entries' ? visible.map(e => { const c = categories.find(c => c.id === e.category)!; return <TableRow key={e.id}><TableCell><div className="expense-name"><span className="category-icon" style={{ background: `${c.color}18` }}>{c.icon}</span><strong>{e.note || c.name}</strong></div></TableCell><TableCell><Badge variant="outline" className="category-badge"><span style={{ background: c.color }}/>{c.name}</Badge></TableCell><TableCell className="date-cell">{dateLabel(e.date)}</TableCell><TableCell className="text-right font-semibold whitespace-nowrap">{money(e.amount)}</TableCell><TableCell><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`Изменить ${e.note || c.name}`} disabled={busy || syncRequired} onClick={() => startEdit(e)}><Pencil size={15}/></Button><Button variant="ghost" size="icon" aria-label={`Удалить ${e.note || c.name}`} disabled={busy || syncRequired} onClick={() => setPendingDelete(e)}><Trash2 size={15}/></Button></div></TableCell></TableRow> }) : group === 'days' ? filteredSummary.byDay.map(([day, total]) => <TableRow key={day}><TableCell><Button variant="link" onClick={() => setSelectedDay(day)}>{dateLabel(day)}</Button></TableCell><TableCell>{visible.filter(e => e.date === day).length}</TableCell><TableCell className="text-right font-semibold">{money(total)}</TableCell></TableRow>) : filteredSummary.byCategory.filter(c => c.total > 0).map(c => <TableRow key={c.id}><TableCell>{c.icon} {c.name}</TableCell><TableCell>{visible.filter(e => e.category === c.id).length}</TableCell><TableCell className="text-right font-semibold">{money(c.total)}</TableCell></TableRow>)}</TableBody></Table><div className="table-footer"><span>Найдено записей: {visible.length}</span><span>Итого <strong>{money(filteredSummary.total)}</strong></span></div></>}
        </CardContent></Card>
        <footer className="page-footer"><span>Чуть больше внимания к тратам. Чуть больше свободы.</span><span>Сделано для вашей повседневности <span className="footer-spark">✳</span></span></footer>
      </div>
    </main>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Изменить расход' : 'Новый расход'}</DialogTitle><DialogDescription>Одна запись — ещё немного ясности в финансах.</DialogDescription></DialogHeader><form onSubmit={submit} className="expense-form"><div><Label htmlFor="amount">Сумма, ₽</Label><Input autoFocus id="amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} required className="amount-input"/></div><div className="form-two-columns"><div><Label htmlFor="category">Категория</Label><Select value={category} onValueChange={v => setCategory(v as CategoryId)}><SelectTrigger id="category"><SelectValue/></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="date">Дата</Label><Input id="date" type="date" min="1900-01-01" max="2100-12-31" value={date} onChange={e => setDate(e.target.value)} required/></div></div><Button type="button" variant="outline" disabled={busy || syncRequired} onClick={() => { setCategoryError(''); setCategoryOpen(true) }}><Plus size={16}/>Своя категория</Button><div><Label htmlFor="note">Заметка <span className="optional">необязательно</span></Label><Input id="note" placeholder="Например, продукты на неделю" maxLength={200} value={note} onChange={e => setNote(e.target.value)}/></div>{formError && <p role="alert" className="form-error">{formError}</p>}<Button type="submit" className="w-full" disabled={busy || syncRequired}><Plus size={17}/>{editing ? 'Сохранить изменения' : 'Добавить расход'}</Button><p className="form-hint"><ShieldCheck size={13}/>Сохраняется в вашем аккаунте</p></form></DialogContent></Dialog>
    <Dialog open={Boolean(pendingDelete)} onOpenChange={v => { if (!v) setPendingDelete(null) }}><DialogContent><DialogHeader><DialogTitle>Удалить расход?</DialogTitle><DialogDescription>{pendingDelete && `${pendingDelete.note || categories.find(c => c.id === pendingDelete.category)?.name} · ${money(pendingDelete.amount)} · ${dateLabel(pendingDelete.date)}. Это действие нельзя отменить.`}</DialogDescription></DialogHeader><div className="dialog-actions"><Button variant="outline" onClick={() => setPendingDelete(null)}>Отмена</Button><Button variant="destructive" disabled={busy || syncRequired} onClick={async () => { if (pendingDelete && await commit({ type: 'delete', id: pendingDelete.id })) { setPendingDelete(null); setMessage('Расход удалён.') } }}>Удалить</Button></div></DialogContent></Dialog>
    <Dialog open={pendingImport !== null} onOpenChange={v => { if (!v) setPendingImport(null) }}><DialogContent><DialogHeader><DialogTitle>{importMode === 'merge' ? 'Перенести записи из браузера?' : 'Восстановить резервную копию?'}</DialogTitle><DialogDescription>В копии {pendingImport?.length} записей. {importMode === 'merge' ? 'Они добавятся к расходам в аккаунте. Одинаковые записи повторно не добавляются; при конфликте перенос отменяется целиком.' : 'Они заменят все текущие расходы (' + expenses.length + '). Сначала скачайте текущую копию.'}</DialogDescription></DialogHeader><div className="dialog-actions"><Button variant="outline" onClick={exportJson}>Скачать текущую</Button><Button disabled={busy || syncRequired} onClick={async () => { if (pendingImport && await commit({ type: importMode, expenses: pendingImport, categories: importCategories })) { setPendingImport(null); if (importMode === 'merge') setLocalDismissed(true); setMessage('Записи сохранены в аккаунте.') } }}>{busy ? 'Сохраняем…' : importMode === 'merge' ? 'Перенести записи' : 'Заменить данные'}</Button></div></DialogContent></Dialog>
    <Dialog open={selectedDay !== null} onOpenChange={v => { if (!v) setSelectedDay(null) }}><DialogContent className="day-dialog"><DialogHeader><DialogTitle>{selectedDay && dateLabel(selectedDay)} · расходы за день</DialogTitle><DialogDescription>{dayExpenses.length ? 'Покупки, категории и заметки за выбранную дату.' : 'В этот день пока нет расходов.'}</DialogDescription></DialogHeader><div className="day-total">{money(summarize(dayExpenses).total)}<small>{dayExpenses.length} записей</small></div><div className="day-entries">{dayExpenses.map(e => { const c = categories.find(c => c.id === e.category)!; return <div className="day-entry" key={e.id}><span className="category-icon" style={{ background: c.color + '18' }}>{c.icon}</span><div><strong>{e.note || c.name}</strong><small>{c.name}</small></div><b>{money(e.amount)}</b><Button size="icon" variant="ghost" aria-label={'Изменить ' + (e.note || c.name)} disabled={busy || syncRequired} onClick={() => { setSelectedDay(null); startEdit(e) }}><Pencil size={15}/></Button></div> })}</div><Button disabled={busy || syncRequired} onClick={() => { const day = selectedDay!; setSelectedDay(null); startAdd(day) }}><Plus size={17}/>Добавить расход в этот день</Button></DialogContent></Dialog>
    <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent><DialogHeader><DialogTitle>Своя категория</DialogTitle><DialogDescription>Категория сохранится в аккаунте и появится в списках и графиках.</DialogDescription></DialogHeader><form className="expense-form" onSubmit={async e => { e.preventDefault(); const added = { id: 'custom-' + crypto.randomUUID(), name: categoryName.trim(), color: categoryColor, icon: categoryIcon.trim() }; try { validateCategories([...customCategories, added]) } catch (error) { setCategoryError((error as Error).message); return } if (await commit({ type: 'category', category: added })) { setCategory(added.id); setCategoryOpen(false); setCategoryName(''); setCategoryError(''); setMessage('Категория добавлена.'); } else setCategoryError('Не удалось сохранить категорию. Закройте окно и проверьте уведомление.'); }}><div><Label htmlFor="category-name">Название</Label><Input autoFocus id="category-name" value={categoryName} maxLength={40} required placeholder="Например, Образование" onChange={e => setCategoryName(e.target.value)}/></div><div className="form-two-columns"><div><Label htmlFor="category-icon">Значок или эмодзи</Label><Input id="category-icon" value={categoryIcon} onChange={e => setCategoryIcon(e.target.value)} required/></div><div><Label htmlFor="category-color">Цвет</Label><Input id="category-color" type="color" value={categoryColor} onChange={e => setCategoryColor(e.target.value)}/></div></div>{categoryError && <p role="alert" className="form-error">{categoryError}</p>}<Button type="submit" disabled={busy || syncRequired}>Создать категорию</Button></form></DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>Простая привычка, понятные финансы</DialogTitle><DialogDescription>Личный журнал расходов</DialogDescription></DialogHeader><div className="help-copy"><p>Нажмите «Добавить расход», укажите сумму, категорию и дату. Итоги и графики пересчитаются автоматически.</p><p>Выбирайте месяц над карточками. В таблице доступны группировки по дням, категориям и всем месяцам. CSV выгружает записи за выбранный месяц с учётом фильтров.</p><p>Нажмите на день графика, чтобы открыть покупки и добавить расход на эту дату. Свои категории создаются кнопкой «Своя категория» в форме расхода или плюсом в блоке категорий.</p><p>JSON сохраняет копию всех загруженных расходов и своих категорий. Восстановление из файла заменяет записи в аккаунте после подтверждения. Перед экспортом нажмите «Обновить», чтобы получить последние изменения.</p><p>Расходы хранятся в вашем аккаунте на сервере. На другом устройстве войдите с тем же email и паролем. Нажмите «Обновить», чтобы увидеть изменения с другого устройства. Без интернета новые изменения не сохраняются.</p></div></DialogContent></Dialog>
  </div>
}
