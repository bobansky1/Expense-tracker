import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Wallet, ShieldCheck } from 'lucide-react'
import { api } from './lib/api'
import type { Session, Snapshot } from './lib/api'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import App from './App'
import './App.css'

export default function AccountGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  async function boot() {
    setLoading(true); setError('')
    try {
      const s = await api.session(); setSession(s)
      setSnapshot(s.user ? await api.expenses() : null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось подключиться к серверу.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void boot() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const s = await api.login(email, password, session?.setupRequired ? token : undefined)
      setSession(s); setPassword(''); setToken('')
      setSnapshot(await api.expenses())
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти.') }
    finally { setLoading(false) }
  }
  if (session?.user && snapshot) return <App key={session.user.id} initial={snapshot} user={session.user} onLogout={() => { setSession(null); setSnapshot(null); void boot() }}/>
  return <div className="auth-page"><section className="auth-card">
    <div className="auth-brand"><span className="brand-icon"><Wallet size={23}/></span>траты.</div>
    <div className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</div>
    <h1>{session?.setupRequired ? 'Добро пожаловать домой' : 'Ваши финансы под рукой'}</h1>
    <p>{session?.setupRequired ? 'Создайте аккаунт владельца. Первичная настройка доступна только с вашим секретным кодом.' : 'Войдите, чтобы видеть свои расходы на компьютере и телефоне.'}</p>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading ? <p role="status">Подключаемся…</p> : !session || session.user ? <Button onClick={() => void boot()}>Повторить подключение</Button> :
      <form className="expense-form" onSubmit={submit}>
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254}/></div>
        <div><Label htmlFor="password">Пароль</Label><Input id="password" type="password" autoComplete={session.setupRequired ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={12}/>{session.setupRequired && <small>От 12 символов. Для длинного пароля используйте латинские буквы.</small>}</div>
        {session.setupRequired && <div><Label htmlFor="setup-token">Код первичной настройки</Label><Input id="setup-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} required/><small>Указан в private/config.php на вашем хостинге.</small></div>}
        <Button type="submit">{session.setupRequired ? 'Создать мой аккаунт' : 'Войти'}</Button>
      </form>}
    <div className="auth-footer"><ShieldCheck size={16}/>Расходы доступны только после входа</div>
  </section></div>
}
