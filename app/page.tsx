'use client';

import { useState, useEffect, useRef } from 'react';
// @ts-ignore
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useTheme } from 'next-themes';
import {
  QrCode,
  UserCheck,
  Moon,
  Sun,
  LogOut,
  Clock,
  Camera,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Mail,
  Lock,
  ArrowRight,
  Sparkles,
  BarChart3,
  History as HistoryIcon
} from 'lucide-react';

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [user, setUser] = useState<{
    role: 'student' | 'teacher';
    name: string;
    email: string;
    id: string;
    section: string;
  } | null>(null);

  const [loginRole, setLoginRole] = useState<'student' | 'teacher'>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [activeDay, setActiveDay] = useState('Thu');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [timetable, setTimetable] = useState<any[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  const [studentTab, setStudentTab] = useState<'today' | 'semester' | 'history'>('today');

  // Teacher QR & Auto-Refresh State
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [generatingQR, setGeneratingQR] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [teacherLogs, setTeacherLogs] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(30);
  const lastTeacherCoords = useRef<{ lat: number; lng: number } | null>(null);

  // Student Scanner & Logs State
  const [scannerActive, setScannerActive] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [marking, setMarking] = useState(false);
  const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);

  useEffect(() => {
    setEmail('');
    setPassword('');
    setLoginError('');
  }, [loginRole]);

  // Load Timetable
  useEffect(() => {
    if (!user) return;
    async function fetchTimetable() {
      setLoadingTimetable(true);
      try {
        const identifier = user?.role === 'teacher' ? user?.id : user?.section;
        const res = await fetch(`/api/timetable?role=${user?.role}&id=${encodeURIComponent(identifier || '')}&day=${activeDay}`);
        const data = await res.json();
        if (data.success) {
          setTimetable(data.data);
          if (user?.role === 'teacher' && data.data.length > 0 && !selectedClass) {
            setSelectedClass(data.data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load timetable:', err);
      } finally {
        setLoadingTimetable(false);
      }
    }
    fetchTimetable();
  }, [user, activeDay]);

  // STUDENT: Load Attendance Logs directly from Google Sheet
  useEffect(() => {
    if (!user || user.role !== 'student') return;
    async function loadStudentAttendance() {
      try {
        const res = await fetch(`/api/attendance/logs?rollNo=${encodeURIComponent(user?.id || '')}`);
        const data = await res.json();
        if (data.success && data.logs) {
          setAttendanceLogs(data.logs);
        }
      } catch (err) {
        console.error('Failed to load student attendance:', err);
      }
    }
    loadStudentAttendance();
  }, [user]);

  // TEACHER: Persistent live attendance for selected class
  useEffect(() => {
    if (!user || user.role !== 'teacher' || !selectedClass) return;

    const fetchTeacherLogs = async () => {
      try {
        const res = await fetch(`/api/attendance/logs?subject=${encodeURIComponent(selectedClass.subject)}`);
        const data = await res.json();
        if (data.success && data.logs) {
          setTeacherLogs(data.logs);
        }
      } catch (err) {
        console.error('Failed to fetch teacher logs:', err);
      }
    };

    fetchTeacherLogs();
    const interval = setInterval(fetchTeacherLogs, 8000);
    return () => clearInterval(interval);
  }, [user, selectedClass]);

  // 30-Second Countdown & Auto-Refresh for QR
  useEffect(() => {
    if (!activeSessionId) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          generateFreshQR();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSessionId, selectedClass]);

  const generateFreshQR = async () => {
    if (!selectedClass || !lastTeacherCoords.current) return;
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: user?.id,
          subject: selectedClass.subject,
          branchSection: selectedClass.room || 'Room',
          latitude: lastTeacherCoords.current.lat,
          longitude: lastTeacherCoords.current.lng
        })
      });

      const data = await res.json();
      if (!data.success) return;

      setActiveSessionId(data.sessionId);

      const payload = JSON.stringify({
        sessionId: data.sessionId,
        subject: selectedClass.subject,
        room: selectedClass.room,
        t: Date.now()
      });

      const url = await QRCode.toDataURL(payload, {
        width: 280,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });

      setQrCodeUrl(url);

      // Instantly refresh logs
      const logsRes = await fetch(`/api/attendance/logs?subject=${encodeURIComponent(selectedClass.subject)}`);
      const logsData = await logsRes.json();
      if (logsData.success && logsData.logs) {
        setTeacherLogs(logsData.logs);
      }
    } catch (err) {
      console.error('Auto QR Refresh error:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: loginRole,
          email,
          password
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Invalid credentials or connection error.');
      }

      setUser(data.user);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setEmail('');
    setPassword('');
    setQrCodeUrl('');
    setActiveSessionId('');
    setScannerActive(false);
    setScanMessage(null);
    setAttendanceLogs([]);
    setTeacherLogs([]);
    lastTeacherCoords.current = null;
  };

  const handleGenerateQR = () => {
    if (!selectedClass) {
      alert('Please select a class first.');
      return;
    }

    setGeneratingQR(true);
    setQrCodeUrl('');
    setCountdown(30);

    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      setGeneratingQR(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        lastTeacherCoords.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };

        try {
          const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teacherId: user?.id,
              subject: selectedClass.subject,
              branchSection: selectedClass.room || 'Room',
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            })
          });

          const data = await res.json();
          if (!data.success) throw new Error(data.message);

          setActiveSessionId(data.sessionId);

          const payload = JSON.stringify({
            sessionId: data.sessionId,
            subject: selectedClass.subject,
            room: selectedClass.room,
            t: Date.now()
          });

          const url = await QRCode.toDataURL(payload, {
            width: 280,
            margin: 2,
            color: { dark: '#0f172a', light: '#ffffff' }
          });

          setQrCodeUrl(url);

          // Class ke saare existing logs load kar lo
          const logsRes = await fetch(`/api/attendance/logs?subject=${encodeURIComponent(selectedClass.subject)}`);
          const logsData = await logsRes.json();
          if (logsData.success && logsData.logs) {
            setTeacherLogs(logsData.logs);
          }
        } catch (err: any) {
          alert('Failed to generate session: ' + err.message);
        } finally {
          setGeneratingQR(false);
        }
      },
      () => {
        alert('Location access is required for attendance verification.');
        setGeneratingQR(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Student Scanner
  useEffect(() => {
    let scanner: any = null;

    if (scannerActive && user?.role === 'student') {
      scanner = new Html5QrcodeScanner(
        'student-reader',
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
          rememberLastUsedCamera: true,
          supportedScanTypes: [0]
        },
        false
      );

      scanner.render(
        (decodedText: string) => {
          try {
            const parsed = JSON.parse(decodedText);
            if (parsed.sessionId) {
              scanner.clear().catch(() => {});
              setScannerActive(false);
              processAttendance(parsed.sessionId, parsed.subject);
            }
          } catch {
            setScanMessage({ type: 'error', text: 'Invalid QR Code format.' });
          }
        },
        () => {}
      );
    }

    return () => {
      if (scanner) scanner.clear().catch(() => {});
    };
  }, [scannerActive]);

  const processAttendance = (sessionId: string, subject: string) => {
    setMarking(true);
    setScanMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              rollNo: user?.id,
              studentName: user?.name,
              branchSection: user?.section,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            })
          });

          const data = await res.json();
          if (data.success) {
            setScanMessage({
              type: 'success',
              text: 'Attendance verified successfully!'
            });

            const logsRes = await fetch(`/api/attendance/logs?rollNo=${encodeURIComponent(user?.id || '')}`);
            const logsData = await logsRes.json();
            if (logsData.success && logsData.logs) {
              setAttendanceLogs(logsData.logs);
            }
          } else {
            setScanMessage({ type: 'error', text: data.message });
          }
        } catch (err: any) {
          setScanMessage({ type: 'error', text: err.message || 'Verification failure.' });
        } finally {
          setMarking(false);
        }
      },
      () => {
        setScanMessage({ type: 'error', text: 'Location access denied. GPS is mandatory for verification.' });
        setMarking(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const isDark = mounted && theme === 'dark';

  // VIEW 1: AUTHENTICATION LOGIN
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors">
        <div className="absolute top-6 right-6">
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 shadow-sm transition cursor-pointer"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25 mb-4">
            <QrCode className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">QR Attendance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">Smart campus attendance system</p>
        </div>

        <div className="w-full max-w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-800 p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setLoginRole('student')}
              className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition cursor-pointer ${
                loginRole === 'student'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Student</span>
            </button>
            <button
              type="button"
              onClick={() => setLoginRole('teacher')}
              className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-2 transition cursor-pointer ${
                loginRole === 'teacher'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Teacher</span>
            </button>
          </div>

          {loginError && (
            <div className="p-3 mb-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email
              </label>
              <input
                type="email"
                placeholder={loginRole === 'student' ? 'student@college.edu' : 'teacher@college.edu'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Password
              </label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-medium py-2.5 rounded-xl text-sm transition flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/20 disabled:bg-blue-300 cursor-pointer"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>Sign In as {loginRole === 'student' ? 'Student' : 'Teacher'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // VIEW 2: TEACHER DASHBOARD
  if (user.role === 'teacher') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-none">QR Attendance</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Smart campus attendance</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-100/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 text-xs font-bold">
                T
              </div>
              <div className="text-left text-xs">
                <p className="font-semibold text-slate-800 dark:text-slate-200 leading-none">{user.name}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{user.section || 'Faculty'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <div className="flex items-center space-x-2 mb-4 text-blue-600 dark:text-blue-400">
                <QrCode className="w-5 h-5" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Smart QR Generator</h2>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">Today's classes</p>

              {loadingTimetable ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading schedule...</div>
              ) : timetable.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 mb-4">
                  No classes scheduled in Google Sheet for today.
                </div>
              ) : (
                <div className="space-y-2.5 mb-5">
                  {timetable.map((cls) => (
                    <div
                      key={cls.id}
                      onClick={() => setSelectedClass(cls)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                        selectedClass?.id === cls.id
                          ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30 ring-1 ring-blue-600'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{cls.subject}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {cls.time} • {cls.room}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        {cls.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleGenerateQR}
                disabled={generatingQR || !selectedClass}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition flex items-center justify-center space-x-2 text-sm shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
              >
                {generatingQR ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Activating GPS & Generating...</span>
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    <span>Generate QR</span>
                  </>
                )}
              </button>

              {qrCodeUrl && (
                <div className="mt-5 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 text-center flex flex-col items-center">
                  <img src={qrCodeUrl} alt="Attendance QR" className="rounded-xl shadow-md border mb-3 max-w-[260px] bg-white p-2" />
                  
                  {/* Auto-refresh timer */}
                  <div className="w-full max-w-[260px]">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span className="flex items-center gap-1 font-medium">
                        <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" /> Auto-updates in
                      </span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{countdown}s</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-1000 ease-linear rounded-full"
                        style={{ width: `${(countdown / 30) * 100}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 mt-2 font-mono">Session ID: {activeSessionId}</p>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Faculty Weekly Timetable</h3>
              <div className="flex space-x-2 mb-4 overflow-x-auto pb-1">
                {days.map((day) => (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      activeDay === day
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {timetable.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No schedule found in Google Sheet for {activeDay}.</p>
              ) : (
                <div className="space-y-3">
                  {timetable.map((cls) => (
                    <div key={cls.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-3">
                      <div className="w-4 h-4 rounded-full border-2 border-blue-500" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cls.subject}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{cls.time}</span>
                          <span>•</span>
                          <span>{cls.room}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Persistent Attendance Logs */}
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm h-full flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
                <div className="flex items-center space-x-2">
                  <UserCheck className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Live Attendance</h3>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Realtime
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg">
                    {teacherLogs.length} Present
                  </span>
                </div>
              </div>

              {teacherLogs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-3">
                    <UserCheck className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No attendance marked yet</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
                    Generate a QR code and student scans will appear here live in Google Sheets.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                  {teacherLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                          ✓
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {log.studentName} ({log.rollNo})
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{log.time}</p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/70 px-2.5 py-1 rounded-md">
                        Verified
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // VIEW 3: STUDENT DASHBOARD
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans transition-colors">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-sm">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 dark:text-white leading-none">QR Attendance</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Smart campus attendance</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 bg-slate-100/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl">
            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 text-xs font-bold">
              S
            </div>
            <div className="text-left text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200 leading-none">{user.name}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Roll: {user.id} ({user.section || 'Student'})</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-4 text-blue-600 dark:text-blue-400">
              <Camera className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Campus QR Scanner</h2>
            </div>

            {!scannerActive && (
              <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                  <QrCode className="w-7 h-7" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Scan your teacher's live QR code to mark attendance.</p>
                <button
                  onClick={() => {
                    setScannerActive(true);
                    setScanMessage(null);
                  }}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Start Camera</span>
                </button>
              </div>
            )}

            {scannerActive && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-black">
                <div id="student-reader" className="w-full" />
                <button
                  onClick={() => setScannerActive(false)}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel Scan
                </button>
              </div>
            )}

            {marking && (
              <div className="mt-4 p-3.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-700 dark:text-blue-300 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Verifying GPS & updating Google Sheets...
              </div>
            )}

            {scanMessage && (
              <div
                className={`mt-4 p-4 rounded-xl border text-sm flex items-start space-x-2.5 ${
                  scanMessage.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
                }`}
              >
                {scanMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs font-medium leading-relaxed">{scanMessage.text}</div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Batch Weekly Timetable</h3>
            <div className="flex space-x-2 mb-4 overflow-x-auto pb-1">
              {days.map((day) => (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeDay === day
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            {loadingTimetable ? (
              <p className="text-xs text-slate-400 py-3 text-center">Loading batch schedule...</p>
            ) : timetable.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                No classes scheduled in Google Sheet for {activeDay}.
              </div>
            ) : (
              <div className="space-y-3">
                {timetable.map((cls) => (
                  <div key={cls.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center space-x-3">
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cls.subject}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{cls.time}</span>
                        <span>•</span>
                        <span>{cls.room}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Attendance Analytics */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center space-x-2 mb-5 text-blue-600 dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Attendance Analytics</h3>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 max-w-xs">
              <button
                onClick={() => setStudentTab('today')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  studentTab === 'today'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setStudentTab('semester')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  studentTab === 'semester'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                Semester
              </button>
              <button
                onClick={() => setStudentTab('history')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
                  studentTab === 'history'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                History
              </button>
            </div>

            {/* TAB VIEW 1: TODAY (Persistent from Google Sheets) */}
            {studentTab === 'today' && (
              <div>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Marked Today</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                      {timetable.filter((cls) =>
                        attendanceLogs.some((log) => {
                          const s1 = (log.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          const s2 = (cls.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                          return s1.includes(s2) || s2.includes(s1);
                        })
                      ).length}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">of {timetable.length || 0} classes</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Today's Rate</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {timetable.length > 0
                        ? Math.round(
                            (timetable.filter((cls) =>
                              attendanceLogs.some((log) => {
                                const s1 = (log.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                const s2 = (cls.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                                return s1.includes(s2) || s2.includes(s1);
                              })
                            ).length /
                              timetable.length) *
                              100
                          )
                        : 0}
                      %
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {timetable.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">No scheduled lectures today.</p>
                  ) : (
                    timetable.map((cls) => {
                      const isPresent = attendanceLogs.some((log) => {
                        const s1 = (log.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        const s2 = (cls.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                        return s1.includes(s2) || s2.includes(s1);
                      });

                      return (
                        <div key={cls.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/40 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{cls.subject}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cls.time}</p>
                            </div>
                          </div>
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                              isPresent
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isPresent ? 'Present' : cls.status}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB VIEW 2: SEMESTER */}
            {studentTab === 'semester' && (
              <div className="space-y-5">
                {attendanceLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center">
                    <BarChart3 className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No attendance data recorded yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 max-w-xs">
                      Once attendance is marked via QR scan, your semester percentage and subject breakdown will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                      <p className="text-xs font-medium text-blue-100">Overall Semester Aggregate</p>
                      <div className="flex items-baseline space-x-2 mt-1">
                        <span className="text-3xl font-extrabold tracking-tight">100%</span>
                        <span className="text-xs text-blue-100 bg-blue-400/30 px-2 py-0.5 rounded-full">
                          {attendanceLogs.length} Lecture(s) Verified
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Marked Lectures</h4>
                      {attendanceLogs.map((log) => (
                        <div key={log.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-between items-center">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{log.subject}</span>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                            Present
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB VIEW 3: HISTORY */}
            {studentTab === 'history' && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Attendance History Logs</h4>

                {attendanceLogs.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center">
                    <HistoryIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No recent history</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 max-w-xs">
                      Scanned QR logs will appear here in chronological order once you mark attendance.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {attendanceLogs.map((item) => (
                      <div key={item.id} className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shadow-sm">
                        <div className="flex items-center space-x-3">
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.subject}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{item.date} • {item.time}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}