import { Clock3, Focus, Headphones, Pause, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
export function StudySessionPage() {
  const [running, setRunning] = useState(false)
  return <div className="page-stack session-page"><div className="page-intro"><div><span className="eyebrow">Focus mode</span><h2>Study session</h2><p>A distraction-free space for your next focused block.</p></div><Button variant="secondary"><Headphones size={17} /> Focus sounds</Button></div><section className="session-card"><div className="session-top"><span className="session-pill"><Focus size={15} /> Deep work</span><span>Session 1 of 3</span></div><div className="timer"><span>25:00</span><small>Pomodoro timer</small></div><div className="timer-actions"><button className="icon-button"><RotateCcw size={18} /></button><Button onClick={() => setRunning(!running)}>{running ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}{running ? 'Pause session' : 'Start session'}</Button><button className="icon-button"><Clock3 size={18} /></button></div><div className="session-note"><strong>Today's focus</strong><span>Complete the next lesson in Advanced React patterns</span></div></section></div>
}
