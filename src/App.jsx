import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function getDueState(dateString, status) {
  if (!dateString || status === 'DONE') return 'normal'

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(dateString + 'T00:00:00')
  due.setHours(0, 0, 0, 0)

  if (due.getTime() === today.getTime()) return 'today'
  if (due < today) return 'overdue'
  return 'upcoming'
}

export default function App() {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')

  const [editingTaskId, setEditingTaskId] = useState(null)
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' })

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'TODO',
    projectName: '',
  })

  function showToast(text, type = 'info') {
    setToast({ show: true, text, type })
  }

  useEffect(() => {
    if (!toast.show) return
    const timer = setTimeout(() => {
      setToast({ show: false, text: '', type: 'info' })
    }, 2500)
    return () => clearTimeout(timer)
  }, [toast])

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
      showToast(error.message, 'error')
      return
    }

    setTasks(data || [])
  }

  async function handleAuth(e) {
    e.preventDefault()

    if (!email || !password) {
      showToast('Email and password are required', 'error')
      return
    }

    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        showToast(error.message, 'error')
      } else {
        showToast('Signup successful. Now log in.', 'success')
        setAuthMode('login')
      }
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) showToast(error.message, 'error')
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  function resetForm() {
    setForm({
      title: '',
      description: '',
      dueDate: '',
      priority: 'MEDIUM',
      status: 'TODO',
      projectName: '',
    })
    setEditingTaskId(null)
  }

  function startEdit(task) {
    setEditingTaskId(task.id)
    setForm({
      title: task.title || '',
      description: task.description || '',
      dueDate: task.due_date || '',
      priority: task.priority || 'MEDIUM',
      status: task.status || 'TODO',
      projectName: task.project_name || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveTask(e) {
    e.preventDefault()

    if (!form.title.trim() || !user) {
      showToast('Task title is required', 'error')
      return
    }

    if (editingTaskId) {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          due_date: form.dueDate || null,
          priority: form.priority,
          status: form.status,
          project_name: form.projectName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTaskId)

      if (error) {
        showToast(error.message, 'error')
        return
      }

      showToast('Task updated', 'success')
      resetForm()
      fetchTasks(user.id)
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
      showToast(error.message, 'error')
      return
    }

    showToast('Task created', 'success')
    resetForm()
    fetchTasks(user.id)
  }

  async function deleteTask(id) {
    const ok = window.confirm('Delete this task?')
    if (!ok) return

    const { error } = await supabase.from('tasks').delete().eq('id', id)

    if (error) {
      showToast(error.message, 'error')
      return
    }

    showToast('Task deleted', 'success')

    if (editingTaskId === id) {
      resetForm()
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
      showToast(error.message, 'error')
      return
    }

    showToast(nextStatus === 'DONE' ? 'Task completed' : 'Task marked active', 'success')
    fetchTasks(user.id)
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const q = search.trim().toLowerCase()
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        (task.description || '').toLowerCase().includes(q) ||
        (task.project_name || '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === 'ALL' || task.status === statusFilter
      const matchesPriority = priorityFilter === 'ALL' || task.priority === priorityFilter

      return matchesSearch && matchesStatus && matchesPriority
    })
  }, [tasks, search, statusFilter, priorityFilter])

  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter((t) => t.status === 'DONE').length
    const active = tasks.filter((t) => t.status !== 'DONE').length
    return { total, done, active }
  }, [tasks])

  if (loading) {
    return <div className="cloud-shell"><div className="auth-card">Loading...</div></div>
  }

  if (!session) {
    return (
      <div className="cloud-shell">
        <div className="auth-card">
          <p className="auth-brand">Taskquil</p>
          <h1 className="auth-title">
            {authMode === 'signup' ? 'Create account' : 'Welcome back'}
          </h1>
          <p className="auth-subtitle">
            Organize tasks, track deadlines, and stay focused.
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            <input
              className="cloud-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="cloud-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary-btn big-btn" type="submit">
              {authMode === 'signup' ? 'Sign Up' : 'Login'}
            </button>
          </form>

          <button
            className="text-btn"
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
    <div className="cloud-shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="bg-orb orb-c" />

      {toast.show && (
        <div className={`toast toast-${toast.type}`}>
          {toast.text}
        </div>
      )}

      <div className="cloud-container">
        <header className="cloud-header">
          <div>
            <p className="auth-brand">Taskquil</p>
            <h1 className="dashboard-title">Your Cloud Workspace</h1>
            <p className="dashboard-subtitle">{user.email}</p>
          </div>

          <button className="secondary-btn" onClick={logout}>
            Logout
          </button>
        </header>

        <section className="stats-row">
          <div className="stat-box">
            <span>Total Tasks</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-box">
            <span>Active</span>
            <strong>{stats.active}</strong>
          </div>
          <div className="stat-box">
            <span>Completed</span>
            <strong>{stats.done}</strong>
          </div>
        </section>

        <main className="cloud-grid">
          <form onSubmit={saveTask} className="panel card-form">
            <h2>{editingTaskId ? 'Edit Task' : 'New Task'}</h2>

            <input
              className="cloud-input"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <textarea
              className="cloud-input cloud-textarea"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <input
              className="cloud-input"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />

            <select
              className="cloud-input"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              className="cloud-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>

            <input
              className="cloud-input"
              placeholder="Project name"
              value={form.projectName}
              onChange={(e) => setForm({ ...form, projectName: e.target.value })}
            />

            <div className="form-actions">
              <button className="primary-btn big-btn" type="submit">
                {editingTaskId ? 'Save Changes' : 'Create Task'}
              </button>

              {editingTaskId && (
                <button className="secondary-btn" type="button" onClick={resetForm}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <section className="panel">
            <div className="panel-top">
              <h2>Your Tasks</h2>
              <span className="task-count">{filteredTasks.length} showing</span>
            </div>

            <div className="filters-row">
              <input
                className="cloud-input"
                placeholder="Search tasks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className="cloud-input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Status</option>
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>

              <select
                className="cloud-input"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
              >
                <option value="ALL">All Priority</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="empty-box">
                <div className="empty-icon">✦</div>
                <h3>No matching tasks</h3>
                <p>Try changing your search or filters.</p>
              </div>
            ) : (
              <div className="task-stack">
                {filteredTasks.map((task) => {
                  const dueState = getDueState(task.due_date, task.status)

                  return (
                    <div key={task.id} className={`task-card-premium ${dueState}`}>
                      <div className="task-card-top">
                        <div>
                          <h3 className="task-title">{task.title}</h3>
                          {task.description && (
                            <p className="task-desc">{task.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="task-meta">
                        <span className={`pill ${task.priority.toLowerCase()}`}>
                          {task.priority}
                        </span>
                        <span className="pill neutral">{task.status}</span>
                        {task.project_name && (
                          <span className="pill project">{task.project_name}</span>
                        )}
                        {task.due_date && (
                          <span className={`pill ${dueState === 'overdue' ? 'high' : dueState === 'today' ? 'today' : 'due'}`}>
                            {dueState === 'overdue'
                              ? `Overdue • ${formatDate(task.due_date)}`
                              : dueState === 'today'
                              ? `Due Today • ${formatDate(task.due_date)}`
                              : `Due ${formatDate(task.due_date)}`}
                          </span>
                        )}
                      </div>

                      <div className="task-actions-premium">
                        <button
                          className="action-btn edit-btn"
                          onClick={() => startEdit(task)}
                        >
                          Edit
                        </button>
                        <button
                          className="action-btn toggle-btn"
                          onClick={() => toggleDone(task)}
                        >
                          {task.status === 'DONE' ? 'Mark Active' : 'Mark Done'}
                        </button>
                        <button
                          className="action-btn delete-btn"
                          onClick={() => deleteTask(task.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}