import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

export default function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'TODO',
    projectName: '',
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      ensureProfile(user)
      fetchTasks(user.id)
    } else {
      setTasks([])
    }
  }, [user])

  async function ensureProfile(currentUser) {
    await supabase.from('profiles').upsert({
      id: currentUser.id,
      email: currentUser.email,
    })
  }

  async function fetchTasks(userId) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setTasks(data || [])
  }

  async function handleAuth(e) {
    e.preventDefault()

    if (!email || !password) {
      alert('Email and password are required')
      return
    }

    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        alert(error.message)
      } else {
        alert('Signup successful. Now log in.')
        setAuthMode('login')
      }
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) alert(error.message)
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  async function addTask(e) {
    e.preventDefault()

    if (!form.title.trim() || !user) {
      alert('Task title is required')
      return
    }

    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title: form.title.trim(),
      description: form.description.trim(),
      due_date: form.dueDate || null,
      priority: form.priority,
      status: form.status,
      project_name: form.projectName.trim(),
    })

    if (error) {
      alert(error.message)
      return
    }

    setForm({
      title: '',
      description: '',
      dueDate: '',
      priority: 'MEDIUM',
      status: 'TODO',
      projectName: '',
    })

    fetchTasks(user.id)
  }

  async function deleteTask(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    fetchTasks(user.id)
  }

  async function toggleDone(task) {
    const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE'

    const { error } = await supabase
      .from('tasks')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)

    if (error) {
      alert(error.message)
      return
    }

    fetchTasks(user.id)
  }

  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === 'DONE').length
    const active = tasks.filter((t) => t.status !== 'DONE').length
    return { total, done, active }
  }, [tasks])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1020', color: 'white', padding: 40 }}>
        Loading...
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1020', color: 'white', padding: 24 }}>
        <div
          style={{
            maxWidth: 460,
            margin: '60px auto',
            padding: 24,
            border: '1px solid #334155',
            borderRadius: 16,
            background: '#111827',
          }}
        >
          <p style={{ color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.14em' }}>
            Taskquil
          </p>
          <h1>{authMode === 'signup' ? 'Create account' : 'Login'}</h1>

          <form onSubmit={handleAuth} style={{ display: 'grid', gap: 12 }}>
            <input
              style={{ padding: 12, borderRadius: 12 }}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={{ padding: 12, borderRadius: 12 }}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button style={{ padding: 12, borderRadius: 12 }} type="submit">
              {authMode === 'signup' ? 'Sign Up' : 'Login'}
            </button>
          </form>

          <button
            style={{
              marginTop: 12,
              background: 'transparent',
              color: '#93c5fd',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}
          >
            {authMode === 'signup'
              ? 'Already have an account? Login'
              : 'Need an account? Sign up'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b1020', color: 'white', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '.14em' }}>
              Taskquil
            </p>
            <h1 style={{ marginTop: 0 }}>Your Cloud Tasks</h1>
            <p style={{ color: '#94a3b8' }}>{user.email}</p>
          </div>

          <button onClick={logout} style={{ padding: 12, borderRadius: 12 }}>
            Logout
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            margin: '20px 0',
          }}
        >
          <div style={{ padding: 16, border: '1px solid #334155', borderRadius: 16 }}>
            Total: {stats.total}
          </div>
          <div style={{ padding: 16, border: '1px solid #334155', borderRadius: 16 }}>
            Active: {stats.active}
          </div>
          <div style={{ padding: 16, border: '1px solid #334155', borderRadius: 16 }}>
            Done: {stats.done}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '360px 1fr',
            gap: 20,
          }}
        >
          <form
            onSubmit={addTask}
            style={{
              padding: 20,
              border: '1px solid #334155',
              borderRadius: 16,
              display: 'grid',
              gap: 12,
              background: '#111827',
            }}
          >
            <h2>New Task</h2>

            <input
              style={{ padding: 12, borderRadius: 12 }}
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <textarea
              style={{ padding: 12, borderRadius: 12, minHeight: 120 }}
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <input
              style={{ padding: 12, borderRadius: 12 }}
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />

            <select
              style={{ padding: 12, borderRadius: 12 }}
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              style={{ padding: 12, borderRadius: 12 }}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>

            <input
              style={{ padding: 12, borderRadius: 12 }}
              placeholder="Project name"
              value={form.projectName}
              onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            />

            <button style={{ padding: 12, borderRadius: 12 }} type="submit">
              Create Task
            </button>
          </form>

          <div
            style={{
              padding: 20,
              border: '1px solid #334155',
              borderRadius: 16,
              background: '#111827',
            }}
          >
            <h2>Your Tasks</h2>

            {tasks.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No tasks yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    style={{ border: '1px solid #334155', borderRadius: 14, padding: 14 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>{task.title}</h3>
                        {task.description && (
                          <p style={{ color: '#94a3b8' }}>{task.description}</p>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{task.priority}</span>
                          <span>{task.status}</span>
                          {task.project_name && <span>{task.project_name}</span>}
                          {task.due_date && <span>Due {task.due_date}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button onClick={() => toggleDone(task)}>Toggle Done</button>
                        <button onClick={() => deleteTask(task.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}