import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'taskmaster_pro_v1'

const defaultData = {
  tasks: [],
  projects: [
    { id: 'p1', name: 'Personal', color: '#7c3aed' },
    { id: 'p2', name: 'Work', color: '#06b6d4' },
  ],
}

function makeId() {
  return Date.now().toString() + Math.random().toString(16).slice(2)
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function isOverdue(task) {
  if (!task.dueDate || task.status === 'DONE') return false
  return task.dueDate < todayString()
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultData
  } catch {
    return defaultData
  }
}

export default function App() {
  const [data, setData] = useState(loadData)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [projectFilter, setProjectFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('due')
  const [showModal, setShowModal] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [toast, setToast] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#7c3aed')

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'TODO',
    projectId: 'p1',
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(timer)
  }, [toast])

  const stats = useMemo(() => {
    const total = data.tasks.length
    const done = data.tasks.filter((t) => t.status === 'DONE').length
    const active = data.tasks.filter((t) => t.status !== 'DONE').length
    const overdue = data.tasks.filter((t) => isOverdue(t)).length
    return { total, done, active, overdue }
  }, [data.tasks])

  const filteredTasks = useMemo(() => {
    let list = [...data.tasks]

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'ALL') list = list.filter((t) => t.status === statusFilter)
    if (priorityFilter !== 'ALL') list = list.filter((t) => t.priority === priorityFilter)
    if (projectFilter !== 'ALL') list = list.filter((t) => t.projectId === projectFilter)

    list.sort((a, b) => {
      if (sortBy === 'due') {
        if (!a.dueDate && !b.dueDate) return 0
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      }
      if (sortBy === 'priority') {
        const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 }
        return rank[b.priority] - rank[a.priority]
      }
      if (sortBy === 'created') {
        return new Date(b.createdAt) - new Date(a.createdAt)
      }
      return a.title.localeCompare(b.title)
    })

    return list
  }, [data.tasks, query, statusFilter, priorityFilter, projectFilter, sortBy])

  function openCreateModal() {
    setEditingTaskId(null)
    setForm({
      title: '',
      description: '',
      dueDate: '',
      priority: 'MEDIUM',
      status: 'TODO',
      projectId: data.projects[0]?.id || '',
    })
    setShowModal(true)
  }

  function openEditModal(task) {
    setEditingTaskId(task.id)
    setForm({
      title: task.title,
      description: task.description,
      dueDate: task.dueDate || '',
      priority: task.priority,
      status: task.status,
      projectId: task.projectId || '',
    })
    setShowModal(true)
  }

  function saveTask(e) {
    e.preventDefault()

    if (!form.title.trim()) {
      setToast('Title is required')
      return
    }

    if (editingTaskId) {
      setData((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === editingTaskId
            ? {
                ...t,
                ...form,
                title: form.title.trim(),
                description: form.description.trim(),
                updatedAt: new Date().toISOString(),
              }
            : t
        ),
      }))
      setToast('Task updated')
    } else {
      const newTask = {
        id: makeId(),
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate,
        priority: form.priority,
        status: form.status,
        projectId: form.projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      setData((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
      }))
      setToast('Task created')
    }

    setShowModal(false)
  }

  function deleteTask(id) {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }))
    setToast('Task deleted')
  }

  function toggleDone(id) {
    setData((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === 'DONE' ? 'TODO' : 'DONE',
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }))
  }

  function addProject(e) {
    e.preventDefault()

    if (!newProjectName.trim()) {
      setToast('Project name is required')
      return
    }

    const exists = data.projects.some(
      (p) => p.name.toLowerCase() === newProjectName.trim().toLowerCase()
    )

    if (exists) {
      setToast('Project already exists')
      return
    }

    const newProject = {
      id: makeId(),
      name: newProjectName.trim(),
      color: newProjectColor,
    }

    setData((prev) => ({
      ...prev,
      projects: [...prev.projects, newProject],
    }))

    setNewProjectName('')
    setNewProjectColor('#7c3aed')
    setToast('Project added')
  }

  function clearAllTasks() {
    const ok = window.confirm('Delete all tasks?')
    if (!ok) return

    setData((prev) => ({
      ...prev,
      tasks: [],
    }))
    setToast('All tasks deleted')
  }

  function getProject(projectId) {
    return data.projects.find((p) => p.id === projectId)
  }

  return (
    <div className="app-shell">
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-orb orb-3" />

      <header className="topbar">
        <div>
          <p className="eyebrow">Productivity Dashboard</p>
          <h1>TaskMaster Pro</h1>
          <p className="subtext">Modern task planner with projects, priorities, and clean focus.</p>
        </div>

        <div className="topbar-actions">
          <button className="ghost-btn" onClick={clearAllTasks}>Clear All</button>
          <button className="primary-btn" onClick={openCreateModal}>+ New Task</button>
        </div>
      </header>

      {toast && <div className="toast">{toast}</div>}

      <section className="stats-grid">
        <div className="stat-card"><span>Total Tasks</span><strong>{stats.total}</strong></div>
        <div className="stat-card"><span>Active</span><strong>{stats.active}</strong></div>
        <div className="stat-card"><span>Completed</span><strong>{stats.done}</strong></div>
        <div className="stat-card"><span>Overdue</span><strong>{stats.overdue}</strong></div>
      </section>

      <main className="content-grid">
        <aside className="sidebar glass">
          <div className="panel">
            <h3>Filters</h3>

            <label className="label">Search</label>
            <input className="input" placeholder="Search tasks..." value={query} onChange={(e) => setQuery(e.target.value)} />

            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>

            <label className="label">Priority</label>
            <select className="input" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <label className="label">Project</label>
            <select className="input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="ALL">All Projects</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>

            <label className="label">Sort By</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="due">Due Date</option>
              <option value="priority">Priority</option>
              <option value="created">Newest</option>
              <option value="title">Title</option>
            </select>
          </div>

          <div className="panel">
            <h3>Projects</h3>

            <div className="project-list">
              {data.projects.map((project) => (
                <div key={project.id} className="project-chip">
                  <span className="project-dot" style={{ backgroundColor: project.color }} />
                  <span>{project.name}</span>
                </div>
              ))}
            </div>

            <form className="project-form" onSubmit={addProject}>
              <input className="input" placeholder="New project" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
              <input className="color-input" type="color" value={newProjectColor} onChange={(e) => setNewProjectColor(e.target.value)} />
              <button className="secondary-btn" type="submit">Add Project</button>
            </form>
          </div>
        </aside>

        <section className="glass main-panel">
          <div className="panel-header">
            <div>
              <h2>Your Tasks</h2>
              <p>{filteredTasks.length} task(s) showing</p>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✦</div>
              <h3>No tasks found</h3>
              <p>Create a task or change your filters.</p>
              <button className="primary-btn" onClick={openCreateModal}>Create First Task</button>
            </div>
          ) : (
            <div className="task-list">
              {filteredTasks.map((task) => {
                const project = getProject(task.projectId)

                return (
                  <article key={task.id} className="task-card">
                    <div className="task-main">
                      <div className="task-top">
                        <label className="check-wrap">
                          <input type="checkbox" checked={task.status === 'DONE'} onChange={() => toggleDone(task.id)} />
                          <span className="custom-check" />
                        </label>

                        <div className="task-text">
                          <h3 className={task.status === 'DONE' ? 'done' : ''}>{task.title}</h3>
                          {task.description && <p>{task.description}</p>}
                        </div>
                      </div>

                      <div className="meta-row">
                        <span className={`badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
                        <span className="badge neutral">{task.status.replace('_', ' ')}</span>

                        {project && (
                          <span className="project-badge">
                            <span className="project-dot" style={{ backgroundColor: project.color }} />
                            {project.name}
                          </span>
                        )}

                        {task.dueDate && (
                          <span className={`badge ${isOverdue(task) ? 'high' : 'neutral'}`}>
                            Due {task.dueDate}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="task-actions">
                      <button className="ghost-btn small" onClick={() => openEditModal(task)}>Edit</button>
                      <button className="danger-btn small" onClick={() => deleteTask(task.id)}>Delete</button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{editingTaskId ? 'Update task' : 'Create task'}</p>
                <h2>{editingTaskId ? 'Edit Task' : 'New Task'}</h2>
              </div>
              <button className="ghost-btn small" onClick={() => setShowModal(false)}>Close</button>
            </div>

            <form className="task-form" onSubmit={saveTask}>
              <div>
                <label className="label">Title</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea className="input textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Write a short description..." />
              </div>

              <div className="form-grid">
                <div>
                  <label className="label">Due Date</label>
                  <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>

                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>

                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>

                <div>
                  <label className="label">Project</label>
                  <select className="input" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                    {data.projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="ghost-btn" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="primary-btn">
                  {editingTaskId ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}