import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const FREE_TASK_LIMIT = 5
const PROMO_CODE = 'newbie01'

function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(timeString) {
  if (!timeString) return ''
  const [hour, minute] = timeString.split(':')
  const date = new Date()
  date.setHours(Number(hour), Number(minute), 0, 0)
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getTaskDueDateTime(dateString, timeString) {
  if (!dateString) return null

  const safeTime = timeString || '23:59'
  const [hour, minute] = safeTime.split(':')
  const due = new Date(dateString + 'T00:00:00')
  due.setHours(Number(hour || 0), Number(minute || 0), 0, 0)
  return due
}

function getDueState(dateString, status, timeString) {
  if (!dateString || status === 'DONE') return 'normal'

  const now = new Date()

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const dueDay = new Date(dateString + 'T00:00:00')
  dueDay.setHours(0, 0, 0, 0)

  const dueDateTime = getTaskDueDateTime(dateString, timeString)

  if (dueDay.getTime() < todayStart.getTime()) return 'overdue'

  if (dueDay.getTime() === todayStart.getTime()) {
    if (dueDateTime && dueDateTime.getTime() <= now.getTime()) return 'overdue'
    return 'today'
  }

  return 'upcoming'
}

function isDueTomorrow(dateString, status) {
  if (!dateString || status === 'DONE') return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const due = new Date(dateString + 'T00:00:00')
  due.setHours(0, 0, 0, 0)

  return due.getTime() === tomorrow.getTime()
}

function getPriorityIcon(priority) {
  if (priority === 'HIGH') return '🔥'
  if (priority === 'MEDIUM') return '🟡'
  return '✅'
}

function validatePassword(password) {
  const minLength = password.length >= 8
  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  if (!minLength) return 'Password must be at least 8 characters'
  if (!hasUpper) return 'Password must include at least 1 uppercase letter'
  if (!hasLower) return 'Password must include at least 1 lowercase letter'
  if (!hasNumber) return 'Password must include at least 1 number'
  if (!hasSpecial) return 'Password must include at least 1 special character'

  return ''
}

function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'https://taskquil.vercel.app'
}

export default function App() {
  const BASE_URL = getBaseUrl()
  const AUTH_REDIRECT_URL = `${BASE_URL}/auth`
  const RESET_REDIRECT_URL = `${BASE_URL}/reset-password`

  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [, setNowTick] = useState(Date.now())

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState('login')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')

  const [editingTaskId, setEditingTaskId] = useState(null)
  const [toast, setToast] = useState({ show: false, text: '', type: 'info' })
  const [alerts, setAlerts] = useState([])
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [audioReady, setAudioReady] = useState(false)

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [promoCodeInput, setPromoCodeInput] = useState('')

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    dueTime: '',
    priority: 'MEDIUM',
    status: 'TODO',
    projectName: '',
  })

  function showToast(text, type = 'info') {
    setToast({ show: true, text, type })
  }

  function playAlertSound() {
    if (!audioReady) return
    const audio = new Audio('/alert.mp3')
    audio.volume = 1
    audio.play().catch(() => {})
  }

  async function checkAndFixPlan(userId, currentProfile) {
    if (!currentProfile?.plan_expires_at) return currentProfile

    const now = new Date()
    const expiresAt = new Date(currentProfile.plan_expires_at)

    if (expiresAt.getTime() > now.getTime()) return currentProfile

    const { data, error } = await supabase
      .from('profiles')
      .update({
        plan: 'free',
        plan_expires_at: null,
      })
      .eq('id', userId)
      .select('*')
      .single()

    if (!error) {
      setProfile(data)
      return data
    }

    return currentProfile
  }

  useEffect(() => {
    if (!toast.show) return
    const timer = setTimeout(() => {
      setToast({ show: false, text: '', type: 'info' })
    }, 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now())
    }, 30000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const currentPath = window.location.pathname
    if (currentPath === '/reset-password') {
      setRecoveryMode(true)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)

      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setShowForgotPassword(false)
        showToast('Set your new password now', 'info')
      }

      if (event === 'SIGNED_IN' && window.location.pathname === '/auth') {
        window.history.replaceState({}, '', '/')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      ensureProfile(user)
      fetchProfile(user.id)
      fetchTasks(user.id)
    } else {
      setTasks([])
      setProfile(null)
    }
  }, [user])

  useEffect(() => {
    const importantAlerts = tasks
      .filter((task) => task.status !== 'DONE')
      .filter((task) => {
        const dueState = getDueState(task.due_date, task.status, task.due_time)
        const tomorrow = isDueTomorrow(task.due_date, task.status)
        return (
          task.priority === 'HIGH' ||
          dueState === 'today' ||
          dueState === 'overdue' ||
          tomorrow
        )
      })
      .map((task) => {
        const dueState = getDueState(task.due_date, task.status, task.due_time)
        const tomorrow = isDueTomorrow(task.due_date, task.status)

        let message = ''
        if (dueState === 'overdue') {
          message = `🚨 "${task.title}" was due${task.due_date ? ` on ${formatDate(task.due_date)}` : ''}${task.due_time ? ` at ${formatTime(task.due_time)}` : ''}`
        } else if (dueState === 'today' && task.priority === 'HIGH') {
          message = `⚠️ "${task.title}" is due today${task.due_time ? ` at ${formatTime(task.due_time)}` : ''} and high priority`
        } else if (dueState === 'today') {
          message = `📅 "${task.title}" is due today${task.due_time ? ` at ${formatTime(task.due_time)}` : ''}`
        } else if (tomorrow) {
          message = `⏳ "${task.title}" is due tomorrow${task.due_time ? ` at ${formatTime(task.due_time)}` : ''}. Finish it soon.`
        } else if (task.priority === 'HIGH') {
          message = `🔥 "${task.title}" is high priority`
        }

        return {
          id: task.id,
          message,
        }
      })

    setAlerts(importantAlerts)
  }, [tasks])

  useEffect(() => {
    if (!session || notifPermission !== 'granted') return
    if (typeof Notification === 'undefined') return

    const sentKey = 'taskquil_sent_notifications'
    const sent = JSON.parse(localStorage.getItem(sentKey) || '[]')
    const freshSent = [...sent]

    tasks.forEach((task) => {
      if (task.status === 'DONE') return

      const dueState = getDueState(task.due_date, task.status, task.due_time)
      const tomorrow = isDueTomorrow(task.due_date, task.status)
      const isHigh = task.priority === 'HIGH'

      if (!isHigh && dueState !== 'today' && dueState !== 'overdue' && !tomorrow) return

      const dueDateTime = getTaskDueDateTime(task.due_date, task.due_time)
      const overdueMomentKey = dueDateTime ? dueDateTime.toISOString() : task.due_date || 'none'
      const uniqueId = `${task.id}-${task.priority}-${task.status}-${overdueMomentKey}-${tomorrow ? 'tomorrow' : dueState}`

      if (freshSent.includes(uniqueId)) return

      let title = 'Taskquil Alert'
      let body = task.title

      if (dueState === 'overdue' && isHigh) {
        title = '🚨 High Priority Task Is Overdue'
        body = `"${task.title}" was due${task.due_time ? ` at ${formatTime(task.due_time)}` : ''} and is now overdue`
      } else if (dueState === 'overdue') {
        title = '⏰ Task Time Is Over'
        body = `"${task.title}" was due${task.due_time ? ` at ${formatTime(task.due_time)}` : ''} and is now overdue`
      } else if (dueState === 'today' && isHigh) {
        title = '⚠️ Due Today + High Priority'
        body = `"${task.title}" is due today${task.due_time ? ` at ${formatTime(task.due_time)}` : ''} and needs attention`
      } else if (dueState === 'today') {
        title = '📅 Task Due Today'
        body = `"${task.title}" is due today${task.due_time ? ` at ${formatTime(task.due_time)}` : ''}`
      } else if (tomorrow) {
        title = '⏳ Task Due Tomorrow'
        body = `"${task.title}" is due tomorrow${task.due_time ? ` at ${formatTime(task.due_time)}` : ''}. Finish it soon`
      } else if (isHigh) {
        title = '🔥 High Priority Task'
        body = `"${task.title}" is marked high priority`
      }

      new Notification(title, {
        body,
        tag: uniqueId,
      })

      playAlertSound()
      freshSent.push(uniqueId)
    })

    localStorage.setItem(sentKey, JSON.stringify(freshSent))
  }, [tasks, session, notifPermission, audioReady])

  async function ensureProfile(currentUser) {
    await supabase.from('profiles').upsert(
      {
        id: currentUser.id,
        email: currentUser.email,
      },
      {
        onConflict: 'id',
      }
    )
  }

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!error && data) {
      const updatedProfile = await checkAndFixPlan(userId, data)
      setProfile(updatedProfile)
    }
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
      const passwordError = validatePassword(password)

      if (passwordError) {
        showToast(passwordError, 'error')
        return
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: AUTH_REDIRECT_URL,
          data: {
            app_name: 'Taskquil',
          },
        },
      })

      if (error) {
        showToast(error.message, 'error')
      } else {
        showToast('Check your email to confirm your account', 'success')
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

  async function resendConfirmationEmail() {
    if (!email) {
      showToast('Enter your email first', 'error')
      return
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL,
      },
    })

    if (error) {
      showToast(error.message, 'error')
      return
    }

    showToast('Confirmation email sent again', 'success')
  }

  async function sendResetPassword(e) {
    e.preventDefault()

    if (!forgotEmail) {
      showToast('Enter your email address', 'error')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: RESET_REDIRECT_URL,
    })

    if (error) {
      showToast(error.message, 'error')
      return
    }

    showToast('Password reset email sent', 'success')
    setShowForgotPassword(false)
  }

  async function handlePasswordRecoveryUpdate(e) {
    e.preventDefault()

    if (!newPassword || !confirmPassword) {
      showToast('Enter and confirm your new password', 'error')
      return
    }

    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }

    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      showToast(passwordError, 'error')
      return
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      showToast(error.message, 'error')
      return
    }

    showToast('Password updated successfully', 'success')
    setRecoveryMode(false)
    setNewPassword('')
    setConfirmPassword('')
    window.history.replaceState({}, '', '/')
  }

  async function redeemPromoCode(e) {
    e.preventDefault()

    if (!user || !profile) {
      showToast('Please log in first', 'error')
      return
    }

    if (!promoCodeInput.trim()) {
      showToast('Enter a promo code', 'error')
      return
    }

    if (promoCodeInput.trim().toLowerCase() !== PROMO_CODE) {
      showToast('Invalid promo code', 'error')
      return
    }

    if (profile.promo_code_used?.toLowerCase() === PROMO_CODE) {
      showToast('This account already used that promo code', 'error')
      return
    }

    const now = new Date()
    const currentExpiry =
      profile.plan_expires_at && new Date(profile.plan_expires_at) > now
        ? new Date(profile.plan_expires_at)
        : now

    const newExpiry = new Date(currentExpiry)
    newExpiry.setMonth(newExpiry.getMonth() + 1)

    const { data, error } = await supabase
      .from('profiles')
      .update({
        plan: 'pro',
        plan_expires_at: newExpiry.toISOString(),
        promo_code_used: PROMO_CODE,
      })
      .eq('id', user.id)
      .select('*')
      .single()

    if (error) {
      showToast(error.message, 'error')
      return
    }

    setProfile(data)
    setPromoCodeInput('')
    showToast('Promo code applied. Pro plan unlocked for 1 month.', 'success')
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      showToast('Browser notifications are not supported', 'error')
      return
    }

    const permission = await Notification.requestPermission()
    setNotifPermission(permission)

    try {
      const unlockAudio = new Audio('/alert.mp3')
      unlockAudio.volume = 0
      await unlockAudio.play()
      unlockAudio.pause()
      unlockAudio.currentTime = 0
      setAudioReady(true)
    } catch {
      setAudioReady(false)
    }

    if (permission === 'granted') {
      showToast('Browser alerts enabled', 'success')
    } else {
      showToast('Notification permission was not allowed', 'error')
    }
  }

  function resetForm() {
    setForm({
      title: '',
      description: '',
      dueDate: '',
      dueTime: '',
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
      dueTime: task.due_time || '',
      priority: task.priority || 'MEDIUM',
      status: task.status || 'TODO',
      projectName: task.project_name || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const now = new Date()
  const proStillActive =
    profile?.plan === 'pro' &&
    profile?.plan_expires_at &&
    new Date(profile.plan_expires_at) > now

  const currentPlan = proStillActive ? 'pro' : 'free'
  const isPro = currentPlan === 'pro'
  const tasksUsed = profile?.tasks_created_count || 0
  const taskLimitReached = !isPro && tasksUsed >= FREE_TASK_LIMIT

  async function saveTask(e) {
    e.preventDefault()

    if (!form.title.trim() || !user) {
      showToast('Task title is required', 'error')
      return
    }

    if (!editingTaskId && taskLimitReached) {
      showToast(`Free plan allows only ${FREE_TASK_LIMIT} tasks`, 'error')
      return
    }

    if (editingTaskId) {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          due_date: form.dueDate || null,
          due_time: form.dueTime || null,
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
      due_time: form.dueTime || null,
      priority: form.priority,
      status: form.status,
      project_name: form.projectName.trim(),
    })

    if (error) {
      showToast(error.message, 'error')
      return
    }

    const currentCount = profile?.tasks_created_count || 0

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        tasks_created_count: currentCount + 1,
      })
      .eq('id', user.id)

    if (profileError) {
      showToast(profileError.message, 'error')
      return
    }

    showToast('Task created', 'success')
    resetForm()
    await fetchProfile(user.id)
    await fetchTasks(user.id)
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
    return (
      <div className="cloud-shell">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="bg-orb orb-c" />
        <div className="auth-card">Loading...</div>
      </div>
    )
  }

  if (recoveryMode) {
    return (
      <div className="cloud-shell">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="bg-orb orb-c" />

        {toast.show && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}

        <section className="auth-card">
          <p className="auth-brand">Taskquil</p>
          <h1 className="auth-title">Reset your password</h1>
          <p className="auth-subtitle">
            Enter a strong new password for your account.
          </p>

          <form onSubmit={handlePasswordRecoveryUpdate} className="auth-form">
            <input
              className="cloud-input"
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              className="cloud-input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button className="primary-btn big-btn" type="submit">
              Update Password
            </button>
          </form>
        </section>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="cloud-shell">
        <div className="bg-orb orb-a" />
        <div className="bg-orb orb-b" />
        <div className="bg-orb orb-c" />

        {toast.show && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}

        <div className="landing-wrap">
          <section className="hero-card">
            <p className="auth-brand">Taskquil</p>
            <h1 className="hero-title">Plan work clearly. Finish tasks faster.</h1>
            <p className="hero-subtitle">
              Taskquil helps you organize tasks, track deadlines, and stay focused.
            </p>

            <div className="hero-actions">
              <button className="primary-btn big-btn" onClick={() => setAuthMode('signup')}>
                Get Started Free
              </button>
              <button className="secondary-btn" onClick={() => setAuthMode('login')}>
                Login
              </button>
            </div>
          </section>

          <section className="auth-card">
            <p className="auth-brand">Taskquil</p>
            <h1 className="auth-title">
              {authMode === 'signup' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="auth-subtitle">
              {authMode === 'signup'
                ? 'Start with the free plan in seconds.'
                : 'Login to access your cloud workspace.'}
            </p>

            {!showForgotPassword ? (
              <>
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

                {authMode === 'signup' && (
                  <button className="text-btn" onClick={resendConfirmationEmail}>
                    Resend confirmation email
                  </button>
                )}

                {authMode === 'login' && (
                  <button className="text-btn" onClick={() => setShowForgotPassword(true)}>
                    Forgot password?
                  </button>
                )}

                <button
                  className="text-btn"
                  onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}
                >
                  {authMode === 'signup'
                    ? 'Already have an account? Login'
                    : 'Need an account? Sign up'}
                </button>
              </>
            ) : (
              <>
                <form onSubmit={sendResetPassword} className="auth-form">
                  <input
                    className="cloud-input"
                    type="email"
                    placeholder="Enter your email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                  <button className="primary-btn big-btn" type="submit">
                    Send Reset Link
                  </button>
                </form>

                <button className="text-btn" onClick={() => setShowForgotPassword(false)}>
                  Back to login
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="cloud-shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="bg-orb orb-c" />

      {toast.show && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}

      <div className="cloud-container">
        <header className="cloud-header">
          <div>
            <p className="auth-brand">Taskquil</p>
            <h1 className="dashboard-title">Your Cloud Workspace</h1>
            <p className="dashboard-subtitle">{user.email}</p>

            <div className="plan-badge-row">
              <span className={`plan-badge ${isPro ? 'pro' : 'free'}`}>
                {isPro ? 'Pro Plan' : 'Free Plan'}
              </span>
              {!isPro && (
                <span className="plan-limit-text">
                  {tasksUsed}/{FREE_TASK_LIMIT} tasks used
                </span>
              )}
            </div>

            {isPro && profile?.plan_expires_at && (
              <p className="dashboard-subtitle">
                Pro active until {formatDateTime(profile.plan_expires_at)}
              </p>
            )}
          </div>

          <div className="header-actions">
            {notifPermission !== 'granted' && (
              <button className="secondary-btn" onClick={enableNotifications}>
                Enable Alerts
              </button>
            )}

            <button className="secondary-btn" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <section className="panel" style={{ marginBottom: '20px' }}>
          <div className="panel-top">
            <h2>Promo Code</h2>
            <span className="task-count">Use code for 1 month Pro</span>
          </div>

          <form onSubmit={redeemPromoCode} className="filters-row">
            <input
              className="cloud-input"
              placeholder="Enter promo code"
              value={promoCodeInput}
              onChange={(e) => setPromoCodeInput(e.target.value)}
            />
            <button className="primary-btn big-btn" type="submit">
              Apply Code
            </button>
            <div className="cloud-input" style={{ display: 'flex', alignItems: 'center' }}>
              Code available: <strong style={{ marginLeft: 8 }}>newbie01</strong>
            </div>
          </form>
        </section>

        {alerts.length > 0 && (
          <section className="alerts-panel">
            <h3>Important Alerts</h3>
            <div className="alerts-list">
              {alerts.map((alert) => (
                <div key={alert.id} className="alert-item">
                  {alert.message}
                </div>
              ))}
            </div>
          </section>
        )}

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

            {!editingTaskId && taskLimitReached && (
              <div className="limit-box">Free plan task limit reached.</div>
            )}

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

            <input
              className="cloud-input"
              type="time"
              value={form.dueTime}
              onChange={(e) => setForm({ ...form, dueTime: e.target.value })}
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
              <button
                className="primary-btn big-btn"
                type="submit"
                disabled={!editingTaskId && taskLimitReached}
              >
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
                  const dueState = getDueState(task.due_date, task.status, task.due_time)
                  const tomorrow = isDueTomorrow(task.due_date, task.status)

                  return (
                    <div key={task.id} className={`task-card-premium ${dueState}`}>
                      <div className="task-card-top">
                        <div>
                          <h3 className="task-title">
                            {getPriorityIcon(task.priority)} {task.title}
                          </h3>
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
                          <span
                            className={`pill ${
                              dueState === 'overdue'
                                ? 'high'
                                : dueState === 'today'
                                  ? 'today'
                                  : tomorrow
                                    ? 'today'
                                    : 'due'
                            }`}
                          >
                            {dueState === 'overdue'
                              ? `Overdue • ${formatDate(task.due_date)}${task.due_time ? ` • ${formatTime(task.due_time)}` : ''}`
                              : dueState === 'today'
                                ? `Due Today • ${formatDate(task.due_date)}${task.due_time ? ` • ${formatTime(task.due_time)}` : ''}`
                                : tomorrow
                                  ? `Due Tomorrow • ${formatDate(task.due_date)}${task.due_time ? ` • ${formatTime(task.due_time)}` : ''}`
                                  : `Due ${formatDate(task.due_date)}${task.due_time ? ` • ${formatTime(task.due_time)}` : ''}`}
                          </span>
                        )}
                      </div>

                      <div className="task-actions-premium">
                        <button
                          type="button"
                          className="action-btn edit-btn"
                          onClick={() => startEdit(task)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="action-btn toggle-btn"
                          onClick={() => toggleDone(task)}
                        >
                          {task.status === 'DONE' ? 'Mark Active' : 'Mark Done'}
                        </button>
                        <button
                          type="button"
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